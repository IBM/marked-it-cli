/**
 * marked-it-cli
 *
 * Copyright (c) 2014, 2017 IBM Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/*eslint-env node */
const fse = require("fs-extra");
const path = require("path");
const jsYaml = require("js-yaml");
const beautify_html = require("js-beautify").html;
const highlightJs = require("highlight.js");

const markedIt = require("marked-it-core");
const common = require("./cli-common");
const fileCopier = require("./fileCopier");
const pdfGenerator = require("./pdfGenerator");

const EXTENSION_HTML = ".html";
const EXTENSION_HTML_REGEX = /\.html$/;
const EXTENSION_MARKDOWN = ".md";
const EXTENSION_MARKDOWN_REGEX = /\.md$/gi;
const EXTENSION_PDF = ".pdf";
const FILENAME_TEMP = ".markeditcli-temp";
const FILENAME_TOC_ORDER = "toc";
const FILENAME_TOC_ORDER_YAML = "toc.yaml";
const FILENAME_TOC_JSON = "toc.json";
const FILENAME_TOC_XML = "toc.xml";
const FOURSPACES = "    ";
const COPY_EXTENSIONS = [EXTENSION_HTML, EXTENSION_PDF, ".css", ".bmp", ".jpg", ".png", ".gif", ".mp4", ".svg", ".js", ".txt", ".xml", ".json"];

const REGEX_ABSOLUTE_PATH = /^[/\\]/;
const REGEX_ABSOLUTE_TOC_PATH = /^[/\\].*[/\\](toc)?$/;
const REGEX_XML_COMMENT = /^<!--[^-]+-->$/;
/* the following regex is sourced from marked: https://github.com/chjj/marked */
const REGEX_LINK = /^!?\[((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*)\]\(\s*<?([\s\S]*?)>?(?:\s+['"]([\s\S]*?)['"])?\s*\)/;

const OPTIONS_MARKED = {
  tables: true,
  gfm: true,
  headerPrefix: "",
  xhtml: true,
  langPrefix: "lang-",
  highlight: function(str, lang) {
    if (lang && highlightJs.getLanguage(lang)) {
      try {
        return highlightJs.highlight(str, { language: lang }).value;
      } catch (e) {
        console.warn("Failed to syntax style a code block with language '" + lang + "'\n" + e.toString());
      }
    }
    return null;
  }
};

var OPTIONS_MARKDOWNIT = {
  html: true,
  linkify: true,
  langPrefix: "lang-",
  highlight: OPTIONS_MARKED.highlight,
  typographer: true
};

const TIMEOUT_PDF = 1000;
const pdfQueue = [];

function generate(options, logger) {
  const sourceDir = options.sourceDir;
  const destDir = options.destDir;
  const overwrite = options.overwrite;
  const disableAttributes = options.disableAttributes;
  const disableFootnotes = options.disableFootnotes;
  const tocJSON = options.tocJSON;
  const disableFrontMatter = options.disableFrontMatter;
  const tocXML = options.tocXML;
  const tocDepth = options.tocDepth;
  const generatePdf = options.generatePdf;
  const pdfOptionsFile = options.pdfOptionsFile;
  const headerFile = options.headerFile;
  const footerFile = options.footerFile;
  const conrefFile = options.conrefFile;
  const extensionFiles = options.extensionFiles;

  if (!fse.existsSync(sourceDir)) {
    logger.critical("Source directory does not exist: " + sourceDir);
    return;
  }

  if (!fse.existsSync(destDir)) {
    try {
      fse.mkdirsSync(destDir);
    } catch (e) {
      logger.critical("Failed to create destination directory: " + destDir + "\n" + e.toString());
      return;
    }
  }

  let fd = null;
  let headerText;
  if (headerFile) {
    try {
      fd = fse.openSync(headerFile, "r");
    } catch (e) {
      logger.error("Failed to open header file: " + headerFile + "\n" + e.toString());
    }

    if (fd) {
      headerText = common.readFile(fd);
      fse.closeSync(fd);
    }
  }

  let footerText;
  if (footerFile) {
    fd = null;
    try {
      fd = fse.openSync(footerFile, "r");
    } catch (e) {
      logger.error("Failed to open footer file: " + footerFile + "\n" + e.toString());
    }

    if (fd) {
      footerText = common.readFile(fd);
      fse.closeSync(fd);
    }
  }

  let pdfOptions;
  if (generatePdf) {
    if (pdfOptionsFile) {
      fd = null;
      try {
        fd = fse.openSync(pdfOptionsFile, "r");
      } catch (e) {
        logger.warning("Failed to open pdf options file: " + pdfOptionsFile + ", will use default pdf generation options." + (e.code === "ENOENT" ? "" : "\n" + e.toString()));
      }

      if (fd) {
        try {
          const content = common.readFile(fd);
          pdfOptions = JSON.parse(content);
        } catch (e) {
          logger.warning("Failed to parse pdf options file: " + pdfOptionsFile + ", will use default pdf generation options.\n" + e.toString());
        }
        fse.closeSync(fd);
      }
    }

    pdfOptions = pdfOptions || {};
  }

  let conrefMap;
  if (conrefFile) {
    fd = null;
    try {
      fd = fse.openSync(conrefFile, "r");
    } catch (e) {
      logger.warning("Failed to open conref file: " + conrefFile + "\n" + e.toString());
    }

    if (fd) {
      try {
        conrefMap = { site: { data: jsYaml.safeLoad(common.readFile(fd)) } };
      } catch (e) {
        logger.warning("Failed to parse conref file: " + conrefFile + "\n" + e.toString());
      }
      fse.closeSync(fd);
    }
  }

  const extensions = {};
  /* register standard extension that adds class "hljs" to all <code> blocks */
  addExtension(extensions, {
    html: {
      onCode: function (html, data) {
        const root = data.htmlToDom(html)[0];
        const code = data.domUtils.find(function (node) { return node.name && node.name.toLowerCase() === "code"; }, [root], true, 1)[0];
        code.attribs["class"] = (code.attribs["class"] ? code.attribs["class"] + " " : "") + "hljs";
        return data.domToHtml(root);
      }
    }
  });

  /* read and register extensions from specified extension files */

  const extensionData = options.extensionData;
  if (extensionFiles && extensionFiles.length) {
    extensionFiles.forEach(function (current) {
      try {
        const extensionPath = fse.realpathSync(current);
        const extensionObject = require(extensionPath);
        if (extensionObject.init && typeof extensionObject.init === "function") {
          const initData = {
            readFile: common.readFile,
            logger: logger.createChild(extensionObject.id),
            sourcePath: path.resolve(sourceDir),
            destinationPath: path.resolve(destDir),
            data: extensionData[extensionObject.id]
          };
          extensionObject.init(initData);
        }
        addExtension(extensions, extensionObject);
      } catch (e) {
        logger.warning("Failed to read extension " + current + "\n" + e.toString());
      }
    });
  }

  /* give extensions the opportunity to add new syntax styling functions */
  let functions = common.invokeExtensions(
    extensions,
    "styling.code.syntax.getAdditionalLanguages",
    {},
    {}
  );
  const keys = Object.keys(functions);
  keys.forEach(function(name) {
    highlightJs.registerLanguage(name, functions[name]);
  });

  logger.important("Generating HTML files...");
  generateHTML(
    sourceDir,
    destDir,
    headerText,
    footerText,
    overwrite,
    pdfOptions,
    tocXML,
    tocJSON,
    extensions,
    conrefMap,
    disableAttributes,
    disableFootnotes,
    disableFrontMatter,
    tocDepth,
    logger
  );

  if (tocXML || tocJSON) {
    logger.important("Generating TOC files...");
    generateTOCs(
      sourceDir,
      destDir,
      overwrite,
      extensions,
      conrefMap,
      tocXML,
      tocJSON,
      logger
    );
  }

  done(pdfOptions, overwrite, destDir, logger);
}

function addExtension(extensions, extensionObject) {
  const keys = Object.keys(extensionObject);
  keys.forEach(function (key) {
    if (typeof extensionObject[key] === "function" && key !== "init") {
      extensions[key] = extensions[key] || [];
      extensions[key].push(extensionObject[key]);
    } else if (typeof extensionObject[key] === "object") {
      extensions[key] = extensions[key] || {};
      addExtension(extensions[key], extensionObject[key]);
    }
  });
}

function cleanupTempDirs(dir, logger) {
  if (!fse.existsSync(dir)) {
    logger.warning("Expected folder does not exist: " + dir);
    return;
  }
  try {
    let stat = fse.statSync(dir);
    if (!stat.isDirectory()) {
      logger.warning("Expected folder is a file: " + dir);
      return;
    }
  } catch (e) {
    logger.warning("Failed to stat: " + dir);
    return;
  }

  const filenames = fse.readdirSync(dir);
  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];
    const filePath = path.join(dir, filename);
    try {
      stat = fse.statSync(filePath);
    } catch (e) {
      logger.warning("Failed to stat: " + filePath + "\n" + e.toString());
      continue;
    }

    if (stat.isDirectory()) {
      if (filename === FILENAME_TEMP) {
        fse.removeSync(filePath);
        logger.info("Cleaned up: " + filePath);
      } else {
        cleanupTempDirs(filePath, logger);
      }
    }
  }
}

function replaceVariables(text, variableMaps, deprecatedConfigVarsArg) {
  if (!(variableMaps || deprecatedConfigVarsArg) || typeof text !== "string") {
    return text;
  }

  if (!Array.isArray(variableMaps)) {
    /* maintain support for old function signature */
    const newArray = [];
    if (variableMaps) {
      newArray.push(variableMaps);
    }
    if (deprecatedConfigVarsArg) {
      newArray.push(deprecatedConfigVarsArg);
    }
    variableMaps = newArray;
  }

  const VAR_OPEN = "{{";
  const VAR_CLOSE = "}}";

  let result = "";
  let pos = 0;

  let index = text.indexOf(VAR_OPEN);
  while (index !== -1) {
    result += text.substring(pos, index);
    pos = index;

    const endIndex = text.indexOf(VAR_CLOSE, index + VAR_OPEN.length);
    if (endIndex === -1) {
      result += text.substring(pos);
      pos = text.length;
      break;
    }

    const key = text.substring(index + VAR_OPEN.length, endIndex).trim();
    let value = "";

    /*
     * Iterate through the maps in reverse order so that if a key is defined in more
     * than one then the definition from the map with highest precedence wins.
     */
    for (let i = variableMaps.length - 1; i >= 0; i--) {
      if (variableMaps[i]) {
        const temp = key.split(".").reduce(function get(result, currentKey) {
          if (result) { /* result may be null if content is not valid yaml */
            return result[currentKey];
          }
        },
          variableMaps[i]);
        if (temp) {
          value = temp;
        }
      }
    }

    if (value) {
      /*
       * If a value was found then substitute it in-place in text rather than putting it right
       * into result, in order to support variables that resolve to other variables.
       */
      text = value + text.substring(endIndex + VAR_CLOSE.length);
      pos = 0;
      index = 0;
    } else {
      /*
       * A value was not found, just treat it as plaintext that will be appended to result later.
       */
      index = endIndex + VAR_CLOSE.length;
    }
    index = text.indexOf(VAR_OPEN, index);
  }
  result += text.substring(pos);
  return result;
}

function generateHTML(
  source,
  destination,
  headerText,
  footerText,
  overwrite,
  pdfOptions,
  tocXML,
  tocJSON,
  extensions,
  conrefMap,
  disableAttributes,
  disableFootnotes,
  disableFrontMatter,
  tocDepth,
  logger,
  version
) {
  const tempDirPath = path.join(destination, FILENAME_TEMP);
  try {
    let stat = fse.statSync(tempDirPath);
    if (!stat.isDirectory()) {
      try {
        fse.removeSync(tempDirPath); /* file */
        fse.mkdirSync(tempDirPath); /* folder */
      } catch (e) {
        logger.warning("Failed to create: " + tempDirPath + "\n" + e.toString());
        // TODO what more to do now?  Abort for this dir?  Only if gen'ing toc files?
      }
    }
  } catch (e) {
    /* typical case, file/folder with this name doesn't exist, so create folder */
    try {
      fse.mkdirSync(tempDirPath);
    } catch (e) {
      logger.warning("Failed to create: " + tempDirPath + "\n" + e.toString());
      // TODO what more to do now?  Abort for this dir?  Only if gen'ing toc files?
    }
  }

  if (version === undefined) {
    version = 1; /* default */
    if (process.env.VERSION === "2") {
      version = 2;
    } else {
      /* look for an attribute that sets version=2 in the top-level toc file only, to determine which md->html generator to use */

      /* try for toc.yaml first */
      let tocPath = path.join(source, FILENAME_TOC_ORDER_YAML);
      let stat = null;
      try {
        stat = fse.statSync(tocPath);
      } catch (e) {
        /* this file is not present, which is fine, just continue */
      }

      if (stat && stat.isFile()) {
        /* found toc.yaml */
        try {
          let yamlToc = jsYaml.load(fse.readFileSync(tocPath, 'utf8'));
          if (((yamlToc.toc || {}).properties || {}).version === 2) {
            version = 2;
          }
        } catch (e) {
          logger.warning("Error reading " + tocPath + ":\n" + e);
        }
      } else {
        /* fall back to trying for toc file */
        tocPath = path.join(source, "toc");
        stat = null;
        try {
          stat = fse.statSync(tocPath);
        } catch (e) {
          /* this file is not present, which is fine, just continue */
        }
        if (stat && stat.isFile()) {
          /* found toc file */
          try {
            var tocContent = fse.readFileSync(tocPath, 'utf8');
            if (/version\s*=\s*\"2\"/.test(tocContent)) {
              version = 2;
            }
          } catch (e) {
            logger.warning("Error reading " + tocPath + ":\n" + e);
          }
        }
      }
    }
    logger.info("Using native generator version " + version + " for: " + source);
  }

  const filenames = fse.readdirSync(source);
  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];
    const sourcePath = path.join(source, filename);
    try {
      stat = fse.statSync(sourcePath);
    } catch (e) {
      logger.warning("Failed to stat: " + sourcePath + "\n" + e.toString());
      continue;
    }

    let defaultShouldProcess = true;
    if (filename.startsWith('.')) { /* hidden file/folder */
      defaultShouldProcess = false;
    }

    if (stat.isDirectory()) {
      const destPath = path.join(destination, filename);
      let shouldProcess = common.invokeExtensions(
        extensions,
        "file.dir.shouldProcess",
        defaultShouldProcess,
        {
          sourcePath: path.resolve(sourcePath),
          destinationPath: path.resolve(destPath)
        }
      );
      if (!shouldProcess) {
        logger.debug("Skipped: " + sourcePath);
        continue;
      }

      try {
        fse.statSync(destPath);
      } catch (e) {
        fse.mkdirSync(destPath, function () { });
      }
      generateHTML(
        sourcePath,
        destPath,
        headerText,
        footerText,
        overwrite,
        pdfOptions,
        tocXML,
        tocJSON,
        extensions,
        conrefMap,
        disableAttributes,
        disableFootnotes,
        disableFrontMatter,
        tocDepth,
        logger,
        version
      );
    } else {
      if (filename === FILENAME_TOC_ORDER || filename === FILENAME_TOC_ORDER_YAML) {
        continue; 	/* already handled separately */
      }

      const outputFilename = filename.replace(EXTENSION_MARKDOWN_REGEX, EXTENSION_HTML);
      const destinationPath = path.join(destination, outputFilename);
      const extension = path.extname(filename).toLowerCase();
      if (extension === EXTENSION_MARKDOWN) {
        let readFd;
        try {
          readFd = fse.openSync(sourcePath, "r");
        } catch (e) {
          logger.error("Failed to open file: " + sourcePath + "\n" + e.toString());
          continue;
        }

        const fileText = common.readFile(readFd);
        fse.closeSync(readFd);
        if (!fileText) {
          logger.error("Failed to read file: " + sourcePath);
          continue;
        }

        let shouldGenerate = common.invokeExtensions(
          extensions,
          "file.md.shouldGenerate",
          defaultShouldProcess,
          {
            sourcePath: path.resolve(sourcePath),
            destinationPath: path.resolve(destinationPath),
            source: fileText
          }
        );
        if (!shouldGenerate) {
          logger.debug("Skipped: " + sourcePath);
          continue;
        }

        const options = {
          processAttributes: !disableAttributes,
          processFootnotes: !disableFootnotes,
          processFrontMatter: !disableFrontMatter,
          variablesMap: conrefMap,
          tocDepth: tocDepth,
          filePath: outputFilename,
          extensions: extensions,
          markedOptions: version === 2 ? OPTIONS_MARKDOWNIT : OPTIONS_MARKED,
          fixInvalidHeaders: false,
          version: version
        };
        const result = markedIt.generate(fileText, options);
        if (!result.html) {
          logger.error("Failed converting markdown to HTML: " + sourcePath);
          continue;
        }

        result.html.text = common.invokeExtensions(
          extensions,
          "html.onComplete",
          result.html.text,
          {
            title: result.properties.document.title || "",
            frontMatterMap: result.properties.document.frontMatterMap || {},
            variablesMap: conrefMap,
            replaceVariables: replaceVariables,
            source: fileText,
            sourcePath: sourcePath,
            htmlToDom: common.htmlToDom,
            domToHtml: common.domToHtml,
            domToInnerHtml: common.domToInnerHtml,
            domUtils: common.domUtils,
            escape: common.escape,
            unescape: common.unescape
          });

        /* create additional variables based on document attributes */
        const frontMatterMap = result.properties.document.frontMatterMap || {};
        const title = result.properties.document.title;
        if (title) {
          frontMatterMap.document = frontMatterMap.document || {};

          /* don't override a variable with the same key defined in the front matter */
          frontMatterMap.document.title = frontMatterMap.document.title || title;
        }

        let htmlOutput = "";
        if (headerText) {
          htmlOutput += replaceVariables(headerText, [frontMatterMap, conrefMap]);
        }
        htmlOutput += result.html.text;
        if (footerText) {
          htmlOutput += replaceVariables(footerText, [frontMatterMap, conrefMap]);
        }

        /* temporary hacks */
        if (!/<body[>\s]/.test(htmlOutput)) {
          htmlOutput = "<body>" + htmlOutput;
        }
        if (!/<html[>\s]/.test(htmlOutput)) {
          htmlOutput = "<html>" + htmlOutput;
        }
        if (!/<\/body>/.test(htmlOutput)) {
          htmlOutput += "</body>";
        }
        if (!/<\/html>/.test(htmlOutput)) {
          htmlOutput += "</html>";
        }

        let writeHTMLFd;
        try {
          writeHTMLFd = fse.openSync(destinationPath, overwrite ? "w" : "wx");
        } catch (e) {
          logger.error("Failed to open file to write: " + destinationPath + "\n" + e.toString());
          continue;
        }
        htmlOutput = beautify_html(htmlOutput, { "indent_size": 2, "extra_liners": ["body"] });
        let success = common.writeFile(writeHTMLFd, Buffer.from(htmlOutput));
        fse.closeSync(writeHTMLFd);
        if (!success) {
          logger.error("*** Failed to write file: " + destinationPath);
          continue;
        }

        logger.info("Wrote: " + destinationPath);

        if (pdfOptions) {
          generatePDF(fse.realpathSync(destinationPath));
        }

        if (tocXML && result.xmlToc && result.xmlToc.text) {
          writeTempTOCfile(
            tempDirPath,
            filename,
            "." + FILENAME_TOC_XML,
            result.xmlToc.text,
            logger
          );
        }
        if (tocJSON && result.jsonToc && result.jsonToc.text) {
          writeTempTOCfile(
            tempDirPath,
            filename,
            "." + FILENAME_TOC_JSON,
            result.jsonToc.text,
            logger
          );
        }

        /* output errors detected during html and TOC generation */
        if (result.html.errors) {
          result.html.errors.forEach(function (current) {
            logger.warning(current + " (" + sourcePath + ")");
          });
        }

        const tocErrors = result.xmlToc.errors;
        if (tocErrors) {
          tocErrors.forEach(function (current) {
            logger.warning(current);
          });
        }
      } else {
        if (defaultShouldProcess) {
          defaultShouldProcess = COPY_EXTENSIONS.indexOf(extension) !== -1;
        }

        let shouldCopy = common.invokeExtensions(
          extensions,
          "file.shouldCopy",
          defaultShouldProcess,
          {
            sourcePath: path.resolve(sourcePath),
            destinationPath: path.resolve(destinationPath)
          }
        );
        if (!shouldCopy) {
          logger.debug("Skipped: " + sourcePath);
          continue;
        }

        fileCopier.copyFile(sourcePath, destinationPath, logger);
      }
    }
  }
}

/* write the file TOCs to temp files for later reference */
function writeTempTOCfile(tempDirPath, filename, extension, content, logger) {
  const tempTOCfilename = filename.replace(EXTENSION_MARKDOWN_REGEX, extension);
  const tempTOCpath = path.join(tempDirPath, tempTOCfilename);
  try {
    const writeTempTOCFd = fse.openSync(tempTOCpath, "w");
    let success = common.writeFile(writeTempTOCFd, Buffer.from(content));
    fse.closeSync(writeTempTOCFd);
    if (!success) {
      logger.error("*** Failed to write file: " + tempTOCpath);
    }
  } catch (e) {
    logger.error("Failed to open temp file to write: " + tempTOCpath + "\n" + e.toString());
  }
};

/*
 * On Windows, wkHtmlToPdf can interfere with other concurrent file operations, including file operations running
 * in other instances of itself.  To mitigate this, queue all .pdf generation requests initially, and process them
 * at a defined interval after all other generation has completed.
 */
function generatePDF(htmlPath) {
  pdfQueue.push(htmlPath);
}

function done(pdfOptions, overwrite, destDir, logger) {
  fileCopier.cleanup(function () {
    const fn = function () {
      if (!pdfQueue.length) {
        return;
      }

      const htmlPath = pdfQueue.splice(0, 1)[0];
      const pdfPath = htmlPath.replace(EXTENSION_HTML_REGEX, EXTENSION_PDF);
      pdfGenerator.generate(htmlPath, pdfPath, overwrite, pdfOptions, logger);
      setTimeout(fn, TIMEOUT_PDF);
    };

    logger.important("Cleaning up temporary files...");
    cleanupTempDirs(destDir, logger);

    if (pdfQueue.length) {
      logger.important("Initiating .pdf file generation (goes a bit slower)...");
      const child_process = require('child_process');
      child_process.execFile("wkhtmltopdf", ["-V"], function (err) {
        if (err) {
          logger.error("Could not locate wkhtmltopdf, so PDFs are not being generated.\nThe path to its binary is likely not included in your native PATH environment variable.\n" + err.toString());
        } else {
          setTimeout(fn, TIMEOUT_PDF);
        }
      });
    }
  });
}

// TODO this function is copied from htmlGenerator, should share it if possible
function computeAttributes(inlineAttributes, attributeDefinitionLists) {
  let keys;
  const result = {};
  const idRegex = /^#([\S]+)/;
  const classRegex = /^\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/;
  const attributeRegex = /^([^\/>"'=]+)=(['"])([^\2]+)\2/;
  const segmentRegex = /([^ \t'"]|((['"])(.(?!\3))*.\3))+/g;

  const inheritedAttributes = {}; /* from ADLs */
  const localAttributes = {}; /* from IALs */

  inlineAttributes.forEach(function (current) {
    let segmentMatch = segmentRegex.exec(current);
    while (segmentMatch) {
      segmentMatch = segmentMatch[0].trim();
      if (segmentMatch.length) {
        let match = idRegex.exec(segmentMatch);
        if (match) {
          localAttributes.id = match[1];
        } else {
          match = classRegex.exec(segmentMatch);
          if (match) {
            let classes = localAttributes["class"] || "";
            classes += (classes ? " " : "") + match[1];
            localAttributes["class"] = classes;
          } else {
            match = attributeRegex.exec(segmentMatch);
            if (match) {
              localAttributes[match[1]] = match[3];
            } else {
              if (attributeDefinitionLists[segmentMatch]) {
                const attributes = computeAttributes([attributeDefinitionLists[segmentMatch]], attributeDefinitionLists);
                keys = Object.keys(attributes);
                keys.forEach(function (key) {
                  if (key === "class" && inheritedAttributes[key]) {
                    /* merge conflicting class values rather than overwriting */
                    inheritedAttributes[key] += " " + attributes[key];
                  } else {
                    inheritedAttributes[key] = attributes[key];
                  }
                });
              } else {
                /* an attribute without a value */
                localAttributes[segmentMatch] = null;
              }
            }
          }
        }
      }
      segmentMatch = segmentRegex.exec(current);
    }
  });

  /* add inherited attributes first so that locally-defined attributes will overwrite inherited ones when a name conflict occurs */

  keys = Object.keys(inheritedAttributes);
  keys.forEach(function (key) {
    result[key] = inheritedAttributes[key];
  });

  keys = Object.keys(localAttributes);
  keys.forEach(function (key) {
    if (key === "class") {
      /* merge conflicting class values rather than overwriting */
      result[key] = (result[key] || "") + (result[key] ? " " : "") + localAttributes[key];
    } else {
      result[key] = localAttributes[key];
    }
  });

  return result;
}

function generateTOCs(
  source,
  destination,
  overwrite,
  extensions,
  conrefMap,
  tocXML,
  tocJSON,
  logger
) {
  /* recursively generate TOCs for child folders first */
  const filenames = fse.readdirSync(source);
  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];

    let defaultShouldProcess = true;
    if (filename.startsWith('.')) { /* hidden file/folder */
      defaultShouldProcess = false;
    }

    const sourcePath = path.join(source, filename);
    let stat;
    try {
      stat = fse.statSync(sourcePath);
    } catch (e) {
      logger.warning("Failed to stat: " + sourcePath + "\n" + e.toString());
      continue;
    }

    if (stat.isDirectory()) {
      const destPath = path.join(destination, filename);

      let shouldProcess = common.invokeExtensions(
        extensions,
        "file.dir.shouldProcess",
        defaultShouldProcess,
        {
          sourcePath: path.resolve(sourcePath),
          destinationPath: path.resolve(destPath)
        }
      );
      if (!shouldProcess) {
        continue;
      }

      try {
        stat = fse.statSync(destPath);
        if (stat.isDirectory()) {
          generateTOCs(
            sourcePath,
            destPath,
            overwrite,
            extensions,
            conrefMap,
            tocXML,
            tocJSON,
            logger);
        }
      } catch (e) {
        console.log(e);
        logger.warning("Excluded from toc generation because no corresponding destination folder found: " + sourcePath);
      }
    }
  }

  // determines whether toc file(s) should be created for this folder
  let tocFileLines = null;
  let yamlToc;

  const yamlTocOrderPath = path.join(source, FILENAME_TOC_ORDER_YAML);
  let yamlStat;
  try {
    yamlStat = fse.statSync(yamlTocOrderPath);
  } catch (e) {
    // this file is not present, which is fine, just continue
    logger.info("No YAML TOC ordering file found: " + yamlTocOrderPath);
  }
  if (yamlStat && yamlStat.isFile()) {
    try {
      yamlToc = jsYaml.load(fse.readFileSync(yamlTocOrderPath, 'utf8'));
    } catch (e) {
      /* this file is not present, which is fine, just continue */
      logger.warning("Error found in " + yamlTocOrderPath + ":\n" + e);
    }
  }

  const tocOrderPath = path.join(source, FILENAME_TOC_ORDER);
  if (!yamlToc) {
    try {
      const stat = fse.statSync(tocOrderPath);
      if (stat.isFile()) {
        const readFd = fse.openSync(tocOrderPath, "r");
        tocFileLines = common.readFile(readFd).split("\n");
        fse.closeSync(readFd);
      }
    } catch (e) {
      /* this file is not present, which is fine, just continue */
      logger.info("No TOC ordering file found: " + tocOrderPath);
    }
  }

  if (yamlToc || tocFileLines) {
    let tocContent;
    if (tocXML) {
      const adapter = new markedIt.tocXMLadapter();
      let tocFilename = path.join(destination, FILENAME_TOC_XML);
      if (tocFileLines) {
        tocContent = generateTOC(
          adapter,
          tocFileLines,
          destination,
          tocOrderPath,
          FILENAME_TOC_XML,
          extensions,
          "xml.toc.file.onGenerate",
          logger
        );
      } else {
        tocContent = generateTOCFromYaml(
          adapter,
          yamlToc,
          destination,
          yamlTocOrderPath,
          FILENAME_TOC_XML,
          extensions,
          "xml.toc.file.onGenerate",
          logger
        );
      }
      writeTocFile(
        tocFilename,
        tocContent,
        overwrite,
        conrefMap,
        extensions,
        "xml.toc.onComplete",
        logger
      );
    }

    if (tocJSON) {
      let adapter = new markedIt.tocJSONadapter();
      tocFilename = path.join(destination, FILENAME_TOC_JSON);
      if (tocFileLines) {
        tocContent = generateTOC(
          adapter,
          tocFileLines,
          destination,
          tocOrderPath,
          FILENAME_TOC_JSON,
          extensions,
          "json.toc.file.onGenerate",
          logger
        );
      } else {
        tocContent = generateTOCFromYaml(
          adapter,
          yamlToc,
          destination,
          yamlTocOrderPath,
          FILENAME_TOC_JSON,
          extensions,
          "json.toc.file.onGenerate",
          logger
        );
      }
      writeTocFile(
        tocFilename,
        tocContent,
        overwrite,
        conrefMap,
        extensions,
        "json.toc.onComplete",
        logger
      );
    }
  }
}

function writeTocFile(
  tocFilename,
  tocString,
  overwrite,
  conrefMap,
  extensions,
  extensionId,
  logger) {
  const tocOutput = common.invokeExtensions(
    extensions,
    extensionId,
    tocString,
    {
      variablesMap: conrefMap,
      replaceVariables: replaceVariables,
      htmlToDom: common.htmlToDom,
      domToHtml: common.domToHtml,
      domToInnerHtml: common.domToInnerHtml,
      domUtils: common.domUtils,
      escape: common.escape,
      unescape: common.unescape
    });

  let canWriteToc = true;
  try {
    let stat = fse.statSync(tocFilename);
    /* there's already a colliding file, so be careful */
    canWriteToc = overwrite && stat.isFile();
  } catch (e) {
    /* this is the most typical outcome, there is not a colliding file, so it's fine to proceed */
  }

  if (canWriteToc) {
    try {
      const writeTocFd = fse.openSync(tocFilename, overwrite ? "w" : "wx");
      const success = common.writeFile(writeTocFd, Buffer.from(tocOutput));
      fse.closeSync(writeTocFd);
      if (!success) {
        logger.error("Failed to write: " + tocFilename);
      } else {
        logger.info("Wrote: " + tocFilename);
      }
    } catch (e) {
      logger.error("Failed to open file to write: " + tocFilename + "\n" + e.toString());
      console.log(e);
    }
  } else {
    logger.warning("Skipped writing toc file due to a file collision: " + tocFilename);
  }
}

function generateTOC(
  adapter,
  tocFileLines,
  destination,
  tocOrderPath,
  tocFilename,
  extensions,
  extensionId,
  logger
) {
  const blockAttributeRegex = /^(\{:(?:\\\}|[^\}])*\})/;
  const refNameRegex = /\{[ ]{0,3}:((?:[\w\d])(?:[\w\d-])*):([^}]*)/;
  const attributeListContentRegex = /\{[ ]{0,3}:([^}]*)/;
  const attributeDefinitionLists = {};
  let eligibleAttributes = [];

  const rootElement = adapter.createRoot();
  let stack = [rootElement]; // a basic stack to represent TOC tree structure
  let pathPrefix, subcollection;

  for (let i = 0; i < tocFileLines.length; i++) {
    let tocItem = tocFileLines[i].replace(/\t/g, FOURSPACES);
    const indentChars = /^[ >]*/.exec(tocItem);
    tocItem = tocItem.trim();
    if (!tocItem.length) {
      eligibleAttributes = [];
      continue; /* blank line */
    }

    if (processAttributeIfPresentInLine(
      tocItem,
      blockAttributeRegex,
      refNameRegex,
      attributeListContentRegex,
      attributeDefinitionLists,
      eligibleAttributes
    )) {
      continue;
    }

    const gtCount = indentChars[0].split(">").length - 1;
    const level = (gtCount || Math.floor(indentChars[0].length / FOURSPACES.length)) + 1;
    if (level > stack.length) {
      eligibleAttributes = [];
      logger.warning("Excluded from toc files due to invalid nesting level: '" + tocItem + "' (" + tocOrderPath + ")");
      continue;
    }

    /* gather attributes in subsequent lines*/
    for (let j = i + 1; j < tocFileLines.length; j++) {
      const nextItem = tocFileLines[j].trim();
      if (!processAttributeIfPresentInLine(
        nextItem,
        blockAttributeRegex,
        refNameRegex,
        attributeListContentRegex,
        attributeDefinitionLists,
        eligibleAttributes
      )) {
        break;
      }
      i = j;		/* consuming this next line now */
    }

    [stack, pathPrefix, subcollection] = addTocItem(
      tocItem,
      tocOrderPath,
      stack,
      level,
      pathPrefix,
      subcollection,
      computeAttributes(eligibleAttributes, attributeDefinitionLists),
      adapter,
      destination,
      tocFilename,
      extensions,
      extensionId,
      logger);

    eligibleAttributes = [];
  }

  return adapter.objectToString(rootElement, true, true);
}

function generateTOCFromYaml(
  adapter,
  yamlToc,
  destination,
  tocOrderPath,
  tocFilename,
  extensions,
  extensionId,
  logger
) {
  const rootElement = adapter.createRoot();
  let stack = [rootElement]; // a basic stack to represent TOC tree structure
  let pathPrefix, subcollection;

  // properties
  let tocItem = '';
  let computedAttributes = { class: 'toc' }; // remove
  for (const [key, value] of Object.entries(yamlToc.toc.properties)) {
    if (key === 'label') {
      tocItem = value;
    } else {
      computedAttributes[key] = value;
    }
  }

  [stack, pathPrefix, subcollection] = addTocItem(
    tocItem,
    tocOrderPath,
    stack,
    1, // level
    pathPrefix,
    subcollection,
    computedAttributes,
    adapter,
    destination,
    tocFilename,
    extensions,
    extensionId,
    logger);

  let i = 0;
  for (const navgroup of yamlToc.toc.entries) {
    [topic, pathPrefix, subcollection] = addYamlTopics(
      navgroup.topics,
      navgroup.id,
      tocOrderPath,
      stack,
      2, // level
      pathPrefix,
      subcollection,
      adapter,
      destination,
      tocFilename,
      extensions,
      extensionId,
      logger,
      true);
    i++;
  }
  return adapter.objectToString(rootElement, true, true);
}

function addTocItem(
  tocItem,
  tocOrderPath,
  stack,
  level,
  pathPrefix,
  subcollection,
  computedAttributes,
  adapter,
  destination,
  tocFilename,
  extensions,
  extensionId,
  logger,
  labelOverride) {

  let topicsString = "";

  // TODO this has moved out to an extension, remove it from here next time breaking changes are permitted
  const match = REGEX_LINK.exec(tocItem);
  if (match) {
    /* is a link to external content */
    topicsString = adapter.createTopic(match[2], match[1]);
  } else {
    /* try to locate a corresponding folder or file */
    const entryFile = path.join(destination, tocItem);
    let exception = null;

    if (REGEX_ABSOLUTE_TOC_PATH.test(tocItem)) {
      let tocPath = tocItem.substring(0, tocItem.lastIndexOf('/') + 1);
      tocPath = path.join(tocPath, tocFilename).replace(/[\\]/g, "/");
      topicsString = adapter.createLink(tocPath) + "\n";
    } else if (REGEX_ABSOLUTE_PATH.test(tocItem)) {
      /* create toc links to corresponding TOC files */
      topicsString = adapter.createLink(tocItem.replace(/[\\]/g, "/"), "topic") + "\n";
    } else if (fse.existsSync(entryFile) && fse.statSync(entryFile).isDirectory()) {
      topicsString = adapter.createLink(path.join(tocItem, tocFilename).replace(/[\\]/g, "/")) + "\n";
    } else {
      const dirname = path.dirname(tocItem);
      const entryDestPath = path.join(destination, dirname);
      const entryTOCinfoPath = path.join(entryDestPath, FILENAME_TEMP);
      const basename = path.basename(tocItem);
      const tocInfoFile = path.join(entryTOCinfoPath, basename.replace(EXTENSION_MARKDOWN_REGEX, "." + tocFilename));
      try {
        const readFd = fse.openSync(tocInfoFile, "r");
        const result = common.readFile(readFd);
        fse.closeSync(readFd);

        /* adjust contained relative links */
        const root = adapter.stringToObject(result);
        adapter.adjustRelativeLinks(root, dirname);

        if (labelOverride) {
          adapter.getChildren(root).topics[0].label = labelOverride;
        }

        topicsString = adapter.objectToString(adapter.getChildren(root));
      } catch (e) {
        /* this could be valid if the toc entry is not intended to correspond to a folder or file, so don't say anything yet */
        exception = e;
      }
    }
  }

  topicsString = common.invokeExtensions(
    extensions,
    extensionId,
    topicsString || tocItem,
    {
      destination: destination,
      source: tocItem,
      level: level,
      pathPrefix: pathPrefix,
      subcollection: subcollection,
      attributes: computedAttributes,
      htmlToDom: common.htmlToDom,
      domToHtml: common.domToHtml,
      domToInnerHtml: common.domToInnerHtml,
      domUtils: common.domUtils,
      escape: common.escape,
      unescape: common.unescape
    }
  );

  if (topicsString) {
    pathPrefix = pathPrefix || adapter.getPathPrefix(topicsString);
    subcollection = subcollection || adapter.getSubcollection(topicsString);
    const parent = stack[level - 1];
    const newTopics = adapter.stringToObject(topicsString);
    if (newTopics) {
      let lastTopic;
      let currentTopic = adapter.getNext(newTopics);
      while (currentTopic) {
        adapter.appendChildObject(parent, currentTopic);
        lastTopic = currentTopic;
        currentTopic = adapter.getNext(newTopics);
      }
      stack = stack.slice(0, level);
      stack.push(lastTopic);
    } else {
      logger.warning("Something is wrong with toc item '" + topicsString + "' in " + destination + " (eg.- typo, pointer to non-existent folder/file...)");
    }
  } else {
    if (!REGEX_XML_COMMENT.test(tocItem)) {
      const warningString = "Excluded from toc files: " + tocOrderPath + "#" + tocItem;
      logger.warning(warningString);
    }
  }
  return [stack, pathPrefix, subcollection];
}

function addYamlTopics(
  topics,
  navgroupId,
  tocOrderPath,
  stack,
  level,
  pathPrefix,
  subcollection,
  adapter,
  destination,
  tocFilename,
  extensions,
  extensionId,
  logger,
  isLast) { // if last item


  let computedAttributes;

  // array of strings, topic objects or topicgroup objects
  let i = 0;
  for (const topic of topics) {
    let tocItem, labelOverride;
    if (typeof topic === 'string') { // filename or link
      tocItem = topic;
    } else if (topic.topic) { // object with a single filename or link
      tocItem = topic.topic;
      labelOverride = topic.navtitle;
    } else if (topic.link === null) { // link object
      // for compability with extensionless TOC code
      tocItem = `[${topic.label}](${topic.href})`;
    }

    if (tocItem) {
      computedAttributes = {};
      // navgroup with only an array of references
      if (level === 2 && i === 0) {
        computedAttributes = {
          class: 'navgroup',
          id: navgroupId
        };          
      }
      // last item of the topics tree
      if (isLast && i === topics.length - 1) {
        computedAttributes["class"] = computedAttributes["class"] ? computedAttributes["class"] + " " : "";
        computedAttributes["class"] += 'navgroup-end';
      }

      [stack, pathPrefix, subcollection] = addTocItem(
        tocItem,
        tocOrderPath,
        stack,
        level,
        pathPrefix,
        subcollection,
        computedAttributes,
        adapter,
        destination,
        tocFilename,
        extensions,
        extensionId,
        logger,
        labelOverride);
    } else { // topicgroup object
      // if the topics object is hetereogeneous (has both strings and objects) 
      // the array will have strings and objects with topicgroup objects
      // containg labels and topics
      let topicgroup;
      if (topic.topicgroup === null) {
        topicgroup = topic;
      } else {
        topicgroup = topic.topicgroup;
      }

      if (level === 2 && i === 0) {
        computedAttributes = {
          class: 'navgroup topicgroup',
          id: navgroupId
        };
      } else {
        computedAttributes = {
          class: 'topicgroup'
        };
      }
      // add label to stack
      [stack, pathPrefix, subcollection] = addTocItem(
        topicgroup.label,
        tocOrderPath,
        stack,
        level,
        pathPrefix,
        subcollection,
        computedAttributes,
        adapter,
        destination,
        tocFilename,
        extensions,
        extensionId,
        logger);

      [stack, pathPrefix, subcollection] = addYamlTopics( // recursive call
        topicgroup.topics || topicgroup.links,
        navgroupId,
        tocOrderPath,
        stack,
        level + 1,
        pathPrefix,
        subcollection,
        adapter,
        destination,
        tocFilename,
        extensions,
        extensionId,
        logger,
        isLast && i === topics.length - 1);
    }
    i++;
  }
  return [stack, pathPrefix, subcollection];
}

function processAttributeIfPresentInLine(
  line,
  blockAttributeRegex,
  refNameRegex,
  attributeListContentRegex,
  attributeDefinitionLists,
  eligibleAttributes) {
  const attributeMatch = blockAttributeRegex.exec(line);
  if (!attributeMatch) {
    return false;
  }
  const refNameMatch = refNameRegex.exec(attributeMatch[0]);
  if (refNameMatch) {
    attributeDefinitionLists[refNameMatch[1]] = refNameMatch[2];
  } else {
    const blockAttributeMatch =
      attributeListContentRegex.exec(attributeMatch[0]);
    eligibleAttributes.push(blockAttributeMatch[1].trim());
  }
  return true;
}

module.exports.generate = generate;
