/**
 * marked-it-cli
 *
 * Copyright (c) 2023 IBM Corporation
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

let html = {};
let logger;
const PROCESS_VARS = "process-variables";

html.onPre = function(html, data) {
	var pre = data.htmlToDom(html)[0];
	if (!pre.attribs[PROCESS_VARS]) {
		return null; /* no-op */
	}

	var children = data.domUtils.getChildren(pre);
	if (children.length === 0 || children[0].name !== "code") {
		return null; /* wrong context so no-op */
	}

	let code = children[0];
	children = data.domUtils.getChildren(code);
	if (children.length === 0 || children[0].type !== "text") {
		return null; /* wrong context so no-op */
	}

	/* right context, so at a minimum will remove the attribute */
	let value = pre.attribs[PROCESS_VARS];
	delete pre.attribs[PROCESS_VARS];
	if (value !== "true") {
		return data.domToHtml(pre);
	}

	let originalText = children[0].data;
	let replacement = data.replaceVariables(originalText);
	if (replacement.warnings.length) {
		replacement.warnings.forEach(function(current) {
			logger.warning(current);
		});
	}
	if (originalText !== replacement.text) {
		children[0].data = replacement.text;
	}
	return data.domToHtml(pre);
};

var init = function(data) {
	logger = data.logger;
}

module.exports.html = html;
module.exports.init = init;
module.exports.id = "codeBlockProcessor";
