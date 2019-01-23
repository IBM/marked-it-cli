/**
 * marked-it-cli
 *
 * Copyright (c) 2019 IBM Corporation
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
var fs = require("fs");
var parser = require("gitignore-parser");
var path = require("path")

var file = {dir: {}, md: {}};

var baseSourcePath, gitIgnorer;

var init = function(data) {
	baseSourcePath = data.sourcePath;
	var gitIgnorePath = path.join(data.sourcePath, '.gitignore');
	var gitIgnoreContent;
	try {
		gitIgnoreContent = fs.readFileSync(gitIgnorePath, 'utf8');
	} catch(e) {
		data.logger.warning("Failed to read a .gitignore file, error code: " + e.code);
	}
	if (gitIgnoreContent) {
		gitIgnorer = parser.compile(gitIgnoreContent);
	}
};

function shouldDoIt(defaultValue, data) {
	if (!gitIgnorer || !defaultValue) {
		return defaultValue;
	}

	var relativePath = path.relative(baseSourcePath, data.sourcePath);
	return gitIgnorer.accepts(relativePath);
}

file.dir.shouldProcess = shouldDoIt;
file.md.shouldGenerate = shouldDoIt;
file.shouldCopy = shouldDoIt;

module.exports.id = "fileFilterExt";
module.exports.file = file;
module.exports.init = init;
