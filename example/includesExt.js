/**
 * marked-it-cli
 *
 * Copyright (c) 2022 IBM Corporation
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

const fse = require("fs-extra");
const path = require("path");
const jsYaml = require("js-yaml");

let logger;
let sourcePath;
// let globalKeyrefMapCopy = {site: {data: {}}};
let globalKeyrefMapCopy;

// Requiring the lodash library for _merge(Deep copy)
const _ = require("lodash");

const FILENAME_INCLUDES_GEN_TOC_ORDER_YAML = "toc_includes_gen.yaml"
const DIRNAME_INCLUDES = "includes";
const DIRNAME_INCLUDE_SEGMENTS = "_include-segments";

const process = {};

// Cleaup
process.onExit = function cleanupTempFiles(obj, data) {
  const { sourcePath } = data;
  logger.info('Cleaning up generated temp files...');
  const includesDir = path.join(sourcePath, 'includes');
  const tempTocFile = path.join(sourcePath, FILENAME_INCLUDES_GEN_TOC_ORDER_YAML);

  try {
    fse.removeSync(tempTocFile);
    logger.info("Cleaned up temp file: " + path.relative(sourcePath,tempTocFile));
    fse.removeSync(includesDir);
    logger.info("Cleaned up temp directory: " + path.relative(sourcePath,includesDir));
  } catch (err) {
    // Log error if something goes wrong while cleaning up temp files generated by extension
    logger.info(err);
  }
}

// regex for syntax -> [Link description](<Link>)
const link_re = /(?:\[[^\]]*\])\(([^\)]*)\)/g;

// Read the srcFile and check for other file references(such as images)
function copyImageLinkFiles(srcFilePath, destDir) {
  logger.info(`Searching for img links to copy for file: ${srcFilePath}`)
  const srcFileDir = path.dirname(srcFilePath);

  try {
    let fileContent = fse.readFileSync(srcFilePath, "utf8");

    let match_image_links = [];
    // Using replace to just run callback fn
    // If image link push to match_image_links, else Do nothing if link is external link and not a file
    fileContent.replace(link_re, (match, p1) => {
      let isUrl = item.startsWith('http');
      if(!isUrl) {
        match_image_links.push(p1);
      }
    });
    // Check if match_image_links is not falsy (null/undefined)
    if(match_image_links.length > 0) {
      match_image_links.forEach(item => {
        // Extract img_filepath using substring method
        const img_filepath = item?.substring(
          item.indexOf('(') + 1,
          item.lastIndexOf(')'));
        try {
          let src = `${srcFileDir}/${img_filepath}`;
          let dest = `${destDir}/${img_filepath}`;
          fse.copySync(src, dest);
        } catch (err) {
          logger.info(err)
        }
      });
    } else {
      logger.info(`No link files to copy for file: ${srcFilePath}`);
    }
  } catch (error) {
    // Throw error if not able to read the file
    // logger.info(err);
  }
}

function processImageMatch(match, p1, full_mdFilePath, destDir, inputDir) {
  let isUrl = p1.startsWith('http');
  // If is link is external and not a file, do nothing and return
  if(isUrl) {
    return match;
  }
  // Extract img_filepath using substring method
  const srcFileDir = path.dirname(full_mdFilePath);

  // const start = match.indexOf('(') + 1;
  const start = match.indexOf(p1);
  // const end = match.lastIndexOf(')');
  // const img_filepath = match?.substring(start, end);
  const img_filepath = p1;
  let srcImagePath = path.resolve(`${srcFileDir}/${img_filepath}`);
  let destImagePath = path.resolve(`${destDir}/${img_filepath}`);
  let destImageDir = path.dirname(path.resolve(destImagePath));

  try {
    fse.ensureDirSync(destImageDir);
    fse.copySync(srcImagePath, destImagePath);
  } catch (err) {
    logger.info(err)
  }

  // Return new relative path for replacement
  const relativePath = path.relative(inputDir, destImagePath);
  const updated_match = match.slice(0, start) + relativePath + ')';
  return updated_match;
}

// Function to process image links in md fileContent
function processImageLinks(fileContent, mdFilePath, full_mdFilePath, inputDir) {
  // console.log(fileContent);
  logger.info(`Searching for img links in file: ${mdFilePath}`);
  // ^ -> beginning
  // \W -> Matches any character that is not a word character (alphanumeric & underscore). Equivalent to [^A-Za-z0-9_]
  const re = /^\W+/;
  // Create otherRepoRoot in main-repo
  // remove initial non alphanumeric characters like '../' and './' from file path
  const destRelativePath = mdFilePath.replace(re, '');

  // Get file name and dir path
  const baseDirName = path.dirname(destRelativePath);
  const baseFileName = path.basename(destRelativePath);

  const destDir = path.resolve(inputDir, 'includes', baseDirName);
  // Create directory structure for other-repo to get copied in
  try {
    fse.ensureDirSync(destDir);
  } catch (err) {
    logger.info(err)
  }

  try {
    fileContent = fileContent.replace(link_re, (match, p1) => processImageMatch(match, p1, full_mdFilePath, destDir, inputDir));
  } catch (error) {
    // Throw error if not able to read the file
    logger.info(error);
  }

  return fileContent;
}

function parseTopicsRecursive(topics, sourcePath) {
  let resData = [];
  // ^ -> beginning
  // \W -> Matches any character that is not a word character (alphanumeric & underscore). Equivalent to [^A-Za-z0-9_]
  const re = /^\W+/;
  for (const topic of topics) {
    if (typeof topic === 'string') {
      resData.push(topic)
    } else if (topic?.include) {
      // Modify the include keyword for further processing
      // Create otherRepoRoot in main-repo
      let includeTopic = topic.include;
      const srcFilePath = path.resolve(sourcePath, includeTopic);
      // remove initial non alphanumeric characters like '../' and './' from file path
      const destRelativePath = includeTopic.replace(re, '');

      // Get file name and dir path
      const baseDirName = path.dirname(destRelativePath);
      const baseFileName = path.basename(destRelativePath);

      const destDir = path.resolve(sourcePath, 'includes', baseDirName);
      // Create directory structure for other-repo to get copied in
      try {
        fse.ensureDirSync(destDir);
      } catch (err) {
        logger.info(err)
      }
      // Copy other-repo to main repo
      const destFilePath = path.resolve(destDir, baseFileName);
      // To copy a file, NOTE: fse.copySync does not support file to dir copy like cp, syntax is srcFilePath to destFilePath 
      try {
        fse.copySync(srcFilePath, destFilePath);
        // Call function to check for other file references (such as images)
        copyImageLinkFiles(srcFilePath, destDir);
      } catch (err) {
        // this file is not present, which is fine, just continue after displaying error
        logger.info(err)
      }

      // Replace include keyword with topic
      topic.include = destRelativePath;
      topic.topic = `includes/${topic.include}`;
      delete topic.include;
      resData.push(topic.topic)
    } else if (typeof topic?.topic === 'string') {
      resData.push(topic.topic)
    } else if (typeof topic?.topicgroup?.topics === 'object') {
      parseTopicsRecursive(topic?.topicgroup?.topics, sourcePath)
    }
  }
  return;
}

// Process jsonData and parse topics for include keyword
function preProcessJson(jsonData, sourcePath) {
  for (entry of jsonData.toc.entries) {
    if (entry?.navgroup) {
      parseTopicsRecursive(entry?.navgroup?.topics, sourcePath);
    }
    if (entry?.topics) {
      parseTopicsRecursive(entry?.topics, sourcePath);
    }

  }
  return jsonData;
}

// main
const init = function (data) {
  logger = data.logger;
  sourcePath = data.sourcePath;
  logger.info("Started includes extension...");
  // globalKeyrefMapCopy.site.data = JSON.parse(JSON.stringify(data.keyrefMap)); // Deep copy
  globalKeyrefMapCopy = JSON.parse(JSON.stringify(data.keyrefMap)); // Deep copy

  // globalKeyrefMapCopy = data.keyrefMap;

  // Read toc.yaml file
  try {
    logger.info("Processing toc.yaml");
    let raw = fse.readFileSync(`${sourcePath}/toc.yaml`);

    // Convert yaml to json
    let data = jsYaml.safeLoad(raw);
    data = preProcessJson(data, sourcePath);

    // Write Json to yaml output back, useful to debug the processed output 
    const yamlOutput = jsYaml.safeDump(data);
    const outputFilename = FILENAME_INCLUDES_GEN_TOC_ORDER_YAML;
    const path_outputFilename = path.join(sourcePath, outputFilename);
    // TODO: Cleanup intermediate temp file
    fse.writeFileSync(path_outputFilename, yamlOutput);
  } catch (err) {
    logger.info(err)
  }
}

const toc = {};
// Function to check if intermediate toc file is generated after include processing and return yamlToc
toc.get = function (obj, data) {
  const sourcePath = data.sourcePath;

  let yamlToc;
  let yamlTocOrderPath;

  const outputFilename = FILENAME_INCLUDES_GEN_TOC_ORDER_YAML;
  const path_outputFilename = path.join(sourcePath, outputFilename)
  let yamlStat;
  try {
    yamlStat = fse.statSync(path_outputFilename);
  } catch (e) {
    // this file is not present, which is fine, just continue
  }
  if (yamlStat && yamlStat.isFile()) {
    try {
      return jsYaml.load(fse.readFileSync(path_outputFilename, 'utf8'));
    } catch (e) {
      logger.warning("Error found in " + path_outputFilename + ":\n" + e);
    }
  }
  return null;
}

// Keyref processing
function processKeyrefs(fileContent, data) {
  const { fullpath_mdFilePath, globalKeyrefMapCopy } = data;
  // console.log('Debug: ', fullpath_mdFilePath);

  const clone_globalKeyrefMapCopy = _.merge({}, globalKeyrefMapCopy);
  // Get file name and dir path
  const baseDirName = path.dirname(fullpath_mdFilePath);
  // Check for keyref.yaml and Process if available
  const FILENAME_KEYREF = 'keyref.yaml';
  let keyrefPath = path.join(baseDirName, FILENAME_KEYREF);

  let localKeyrefMap = {site: {data: {}}};

  // globalKeyrefMapCopy.site.data = JSON.parse(JSON.stringify(variables.site.data)); // Deep copy
  let keyStore = {};

  try {
    // localKeyrefMap.site.data = jsYaml.safeLoad(common.readFile(fd));
    localKeyrefMap.site.data = jsYaml.safeLoad(fse.readFileSync(keyrefPath));
    // keyStore = _.merge(keyStore, localKeyrefMap.site.data, clone_globalKeyrefMapCopy.site.data);
    keyStore = _.merge({}, localKeyrefMap.site.data);
    keyStore = _.merge(keyStore, clone_globalKeyrefMapCopy.site.data);
    // console.dir("Debug: Merging complete... ", keyStore);

    // keyStore = Object.assign(keyStore, jsYaml.safeLoad(fse.readFileSync(keyrefPath)));
  } catch (e) {
    // logger.warning("Failed to parse keyref file: " + keyrefPath + "\n" + e.toString());
  }

  // console.dir(keyStore);
  const re_keyref = /(\{\{)site.data.(.*)(\}\})/g;

  try {
    fileContent = fileContent.replace(re_keyref, (match, p1, p2, p3) => {
      let value = match;
      let key = p2.trim();
      if (keyStore) {
        let temp = key.split(".").reduce(
          function get(result, currentKey) {
            if (result) { /* result may be null if content is not valid yaml */
              return result[currentKey];
            }
          },
          keyStore);
        if (temp) {
          value = temp;
        }
      }
      return value;
    });
  } catch (error) {
    // Throw error if not able to read the file
    logger.info(error);
  }

  return fileContent;
}

function tracePath(match, p1, filePath) {
  const fileDir = path.dirname(filePath);

  // decide the relative path always to the original FileText and sourceDir passed by mdProcessor
  let rootRepo = path.relative(refDir, fileDir);

  if(rootRepo === '') rootRepo = '.';

  let relativeTracePath = [rootRepo, p1].join(path.sep);

  // Update the match with modified path to trace bakc later
  const updated_match = '{{' + relativeTracePath + '}}';
  return updated_match;
}

let refDir;
const md = { variables: {} }
md.variables.add = function (obj, data) {
  const { sourcePath, fileText, parseMarkdownSections } = data;
  const sourceDirPath = path.dirname(sourcePath);
  refDir = sourceDirPath;
  let fileTextCopy = fileText;
  logger.info("Processing file " + sourcePath);

  // Initialize length for matches and sections
  let matches_len = 0;
  let sections_len = 0;

  // NOTE: str.match return null if no match is found, but we can find further matches later during nested case
  // So either set successful matches or empty array

  // Regex search for anything between '{{' and '}}'
  // const re = new RegExp('\{\{.+\.md\}\}', 'g');
  // const re = /\{\{.+\.md\}\}/g;
  const re = /\{\{(.+\.md)\}\}/g;

  // Regex search for section ids
  // const re_sections = /\{\{.+\.md#.+\}\}/g;
  const re_sections = /\{\{(.+\.md#.+)\}\}/g;

  // Replace the regex matches with path relative to inputDir
  // so we can trace back the path during nested traversal
  fileTextCopy = fileTextCopy.replace(re, (match, p1) => tracePath(match, p1, sourcePath));
  fileTextCopy = fileTextCopy.replace(re_sections, (match, p1) => tracePath(match, p1, sourcePath));

  let matches = fileText.match(re) || [];
  let matches_section = fileText.match(re_sections) || [];

  function checkNested(modifiedFileContent, matches_len, sections_len){
    try {
      // Check for nested includes if any before writing the content as value
      let nested_matches = modifiedFileContent.match(re);
      let nested_sections = modifiedFileContent.match(re_sections);

      if(nested_matches) {
        // TODO: Ensure unique values in array, and cycle detection?
        matches.push(...nested_matches);
        matches = _.uniq(matches);

        // Update matches_len
        matches_len = matches.length;
      }
      if(nested_sections){
        // TODO: Ensure unique values in array, and cycle detection?
        matches_section.push(...nested_sections);
        matches_section =_.uniq(matches_section);
        // Update matches_len
        sections_len = matches_section.length;
      }
    } catch(err){
      logger.info(err);
    }

    return [matches_len, sections_len];
  }

  function readFileContent(sourceDirPath, mdFilePath) {
    // Read mdFile and assign the content as key value pair in conrefMap
    const fullpath_mdFilePath = path.join(sourceDirPath, mdFilePath)
    let mdStat;
    // Default value
    let fileContent = null;

    try {
      mdStat = fse.statSync(fullpath_mdFilePath);
    } catch (e) {
      // this file is not present, which is fine, just continue
    }
    if (mdStat && mdStat.isFile()) {
      try {
        fileContent = fse.readFileSync(fullpath_mdFilePath, 'utf8');
        // Replace matches with tracePath to trackBack later
        fileContent = fileContent.replace(re, (match, p1) => tracePath(match, p1, fullpath_mdFilePath));
        fileContent = fileContent.replace(re_sections, (match, p1) => tracePath(match, p1, fullpath_mdFilePath));
      } catch (e) {
        // this file is not present, which is fine, just continue
      }
    }
    return {fileContent , fullpath_mdFilePath};
  }

  function matches_processItem(item, matches_len, sections_len) {
    const mdFilePath = item?.substring(
      item.indexOf('{{') + 2,
      item.lastIndexOf('}}')
    );

    let {fileContent , fullpath_mdFilePath} = readFileContent(sourceDirPath, mdFilePath);

    if (fileContent) {
      // Process content for links(image)
      /* Function requires filecontent(string),
          and paths(to determine destDir to copy required files in includes/<other-repo-root-dir>),
          */
      const modifiedFileContent = processImageLinks(
        fileContent,
        mdFilePath,
        fullpath_mdFilePath,
        sourceDirPath
      );
      // Check for nested includes if any before writing the content as value
      // checkNested(modifiedFileContent, matches_len, sections_len);
      [matches_len, sections_len] = checkNested(
        fileContent,
        matches_len,
        sections_len
      );
      // Add start and and comment
      const startComment = `\n<!-- Include START: ${mdFilePath} -->\n`;
      const endComment = `\n<!-- Include END: ${mdFilePath} -->\n`;
      // Update the results, key is mdFilePath
      obj[mdFilePath] = startComment + modifiedFileContent + endComment;
    }
    // Return updated matches_len and sections_len
    return [matches_len, sections_len];
  }

  function sections_processItem(item, matches_len, sections_len) {
    const fullSectionId = item?.substring(
      item.indexOf('{{') + 2,
      item.lastIndexOf('}}')
    );

    // Split file name and section Id(separator '#')
    const result = fullSectionId.split('#');
    const mdFilePath = result[0];
    const sectionId = result[1];

    let {fileContent , fullpath_mdFilePath} = readFileContent(sourceDirPath, mdFilePath);
    if (fileContent) {
      fileContent = processKeyrefs(fileContent, {
        fullpath_mdFilePath,
        globalKeyrefMapCopy,
      });
      // Update the results
      const modifiedFileContent = processImageLinks(
        fileContent,
        mdFilePath,
        fullpath_mdFilePath,
        sourceDirPath
      );
      let parsedSections = parseMarkdownSections(modifiedFileContent, true);
      // Check for nested includes(sections) if any before writing the content as value
      [matches_len, sections_len] = checkNested(
        modifiedFileContent,
        matches_len,
        sections_len
      );
      // Add start and and comment
      const startComment = `\n<!-- Include START: ${fullSectionId} -->\n`;
      const endComment = `\n<!-- Include END: ${fullSectionId} -->\n`;
      // Key is fullSectionId, that will be used in obj for further processing in conrefs
      obj[fullSectionId] =
        startComment + parsedSections[sectionId] + endComment;
    }

    // Return updated matches_len and sections_len
    return [matches_len, sections_len];
  }

  /* one file can have both, more inclued files and more sections
  / Similarly , one section can have both, more inclued files and more sections
  */
  if(matches || matches_section) {
    if (matches) {
      matches_len = matches.length;
    } else {
      matches_len = 0;
    }
    if (matches_section) {
      sections_len = matches_section.length;
    } else {
      sections_len = 0;
    }
    let processed_matches_count = 0;
    let processed_sections_count = 0;

    while(processed_matches_count < matches_len || processed_sections_count < sections_len) {
      let item;
      if(processed_matches_count < matches_len) {
        // Update matches and section len if nested paths are found
        item = matches[processed_matches_count];
        [matches_len, sections_len] = matches_processItem(item, matches_len, sections_len);
        processed_matches_count++;
      }

      if(processed_sections_count < sections_len) {
        // Update matches and section len if nested paths are found
        item = matches_section[processed_sections_count];
        [matches_len, sections_len] = sections_processItem(item, matches_len, sections_len);
        processed_sections_count++;
      }
    }
  }
  return obj;
}

// Function for Dynamic listing of directory structure
const file = {
    dir: {
      files: {},
    },
};

file.dir.files.get =  function (filenames, data){
  // sourcePath is inputDir which is populated in init function, data.sourcePath is currentDir
  // currentDir is the directory where generateHTML function is active
  const currentDir = data.sourcePath;
  // Ensure 'includes' dir is last entry so it gets processed last
  if(currentDir === sourcePath){
    // remove DIRNAME_INCLUDE_SEGMENTS to avoid processing it
    let targetIndex = filenames.indexOf(DIRNAME_INCLUDE_SEGMENTS);
    if(targetIndex > -1) { // only splice array when item is found
      filenames.splice(targetIndex, 1); // 2nd parameter means remove one item only
    }

    // remove DIRNAME_INCLUDES first, and add later at the end of array to ensure it is processed last
    targetIndex = filenames.indexOf(DIRNAME_INCLUDES);
    if(targetIndex > -1) { // only splice array when item is found
      filenames.splice(targetIndex, 1); // 2nd parameter means remove one item only
    }
    // Ensure includes dir, and push to filesnames array at the end
    try {
        fse.ensureDir(path.join(sourcePath, DIRNAME_INCLUDES));
        filenames.push(DIRNAME_INCLUDES);
    } catch (err) {
        logger.info(err)
    }
  }
  return filenames;
}

module.exports.init = init;
module.exports.toc = toc;
module.exports.md = md;
module.exports.id = "includes";
module.exports.process = process;
module.exports.file = file;