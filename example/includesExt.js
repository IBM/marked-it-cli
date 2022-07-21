/**
 * marked-it-cli
 *
 * Copyright (c) 2018 IBM Corporation
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
const FILENAME_INCLUDES_GEN_TOC_ORDER_YAML = "toc_includes_gen.yaml"

function parseTopicsRecursive(topics, sourcePath) {
  let resData = [];
  for (const topic of topics) {
    if (typeof topic === 'string') {
      resData.push(topic)
    } else if (topic?.include) {
      // Moddify the include keyword for further processing
      let result = topic.include.split('/');
      result.shift();
      const otherRepoRoot = result[0];
      // Create otherRepoRoot in main-repo
      const srcFilePath = `${sourcePath}/${topic.include}`;
      const destDir = `${sourcePath}/includes/${otherRepoRoot}/`;
      // Create otherRepoRoot to store included files later
      fse.mkdirpSync(destDir);

      // TODO: confirm: can included files be inside nested subfolders?
      const includedFileName = result[1];

      // Copy other-repo to main repo
      const destFilePath = `${destDir}${includedFileName}`;

      // To copy a file, NOTE: fse.copySync does not supprot file to dir copy like cp, syntax is srcFilePath to destFilePath 
      try {
        fse.copySync(srcFilePath, destFilePath);
      } catch (err) {
        console.error(err)
      }

      // Replace include keyword with topic
      topic.include = result.join('/')
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
const init = function (initData) {
  let { sourcePath, logger } = initData;
  logger.info("Started inclueds extension...");

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
    logger.error(err)
  }
}

const toc = { yaml: {} };
// Function to check if intermediate toc file is generated after include processing and return yamlToc
toc.yaml.get = function (resultObj, data) {
  const sourcePath = data.sourcePath;
  logger = data.logger;

  let yamlToc;
  let yamlTocOrderPath;

  const outputFilename = FILENAME_INCLUDES_GEN_TOC_ORDER_YAML;
  const path_outputFilename = path.join(sourcePath, outputFilename)
  let yamlStat;
  try {
    yamlStat = fse.statSync(path_outputFilename);
  } catch (e) {
    // this file is not present, which is fine, just continue
    logger.warning("No YAML TOC ordering file found: " + path_outputFilename);
  }
  if (yamlStat && yamlStat.isFile()) {
    try {
      yamlToc = jsYaml.load(fse.readFileSync(path_outputFilename, 'utf8'));
      yamlTocOrderPath = path_outputFilename;
      // Update the results
      resultObj.yamlToc = yamlToc;
      resultObj.yamlTocOrderPath = yamlTocOrderPath;

      return resultObj;
    } catch (e) {
      /* this file is not present, which is fine, just continue */
      logger.warning("Error found in " + path_outputFilename + ":\n" + e);
    }
  }
  // Return undefined if the file not found
  return resultObj;
}

const md = {}
md.onAddVariables = function (mappedFromExtension, data) {
  const { sourcePath, logger, fileText } = data;
  const sourceDirPath = path.dirname(sourcePath);
  logger.info("Processing file " + sourcePath);

  // // Regex search for anything between '{{' and '}}'
  // const re = new RegExp('\{\{.+\.md\}\}', 'g');
  const re = /\{\{.+\.md\}\}/g;
  const matches = fileText.match(re);

  // // Check for valid .md file paths in results
  if (matches) {
    matches.forEach(item => {
      const mdFilePath = item.substring(
        item.indexOf('{{') + 2,
        item.lastIndexOf('}}')
      );

      // Read mdFile and assign the content as key value pair in conrefMap
      const fullpath_mdFilePath = path.join(sourceDirPath, mdFilePath)
      let mdStat;
      let fileContent;
      
      try {
        mdStat = fse.statSync(fullpath_mdFilePath);
      } catch (e) {
        // this file is not present, which is fine, just continue
        logger.warning("No such file found: " + fullpath_mdFilePath);
      }
      if (mdStat && mdStat.isFile()) {
        try {
          fileContent = fse.readFileSync(fullpath_mdFilePath, 'utf8');
          // Update the results
          // Key is mdFilePath
          mappedFromExtension[mdFilePath] = fileContent;
        } catch (e) {
          /* this file is not present, which is fine, just continue */
          logger.warning("Error found in " + fullpath_mdFilePath + ":\n" + e);
        }
      };
    });
  }

  return mappedFromExtension;
}

module.exports.init = init;
module.exports.toc = toc;
module.exports.md = md;
module.exports.id = "includes";