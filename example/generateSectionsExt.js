/**
 * marked-it-cli
 *
 * Copyright (c) 2014, 2018 IBM Corporation
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

var REGEX_HEADER = /^h([123456])$/;

var html = {};
var logger;

function processHeaders(level, dom, data) {
	var name = "h" + level;
	var headers = data.domUtils.findAll(
		function(current) {
			return current.name === name;
		},
		dom
	);
	for (var i = 0; i < headers.length; i++) {
		var current = headers[i];
		var id = data.domUtils.getAttributeValue(current, "id");
		if (!id) {
			logger.warning("Header has no id, so not generating an accompanying <section>: " + data.sourcePath + " : '" + current.children[0].data + "'");
			continue;
		}

		var section = data.htmlToDom("<section id='section-" + id + "'></section>")[0];		
		var keys = Object.keys(current.attribs);
		keys.forEach(function(key) {
			if (key !== "id") {
				section.attribs[key] = current.attribs[key];
				delete current.attribs[key]
			}
		});

		var next = current.next;
		data.domUtils.replaceElement(current, section);
		data.domUtils.appendChild(section, current);

		current = next;
		while (current) {
			var result = REGEX_HEADER.exec(current.name);
			if (result) {
				var siblingLevel = parseInt(result[1]);
				if (siblingLevel <= level) {
					break;
				}
			}
			next = current.next;
			data.domUtils.removeElement(current);
			data.domUtils.appendChild(section, current);
			current = next;
		}
	}
}

html.onComplete = function(html, data) {
	var dom = data.htmlToDom("<root>" + html + "</root>");
	for (var i = 6; i >= 1; i--) {
		processHeaders(i, dom, data);
	}
	return data.domToInnerHtml(dom[0]);
};

var init = function(data) {
	logger = data.logger;
};

module.exports.html = html;
module.exports.id = "generateSections";
module.exports.init = init;
