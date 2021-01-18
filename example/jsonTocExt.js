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

var fs = require("fs");
var path = require("path");

var headerText, footerText;
var logger;

var NOTOC = "notoc";
var PREFIX_TOC = "toc-";
var REGEX_XML_COMMENT = /^<!--[^-]+-->$/;

/* the following regex is sourced from marked: https://github.com/chjj/marked */
var REGEX_LINK = /^!?\[((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*)\]\(\s*<?([\s\S]*?)>?(?:\s+['"]([\s\S]*?)['"])?\s*\)/;

var html = {};
var json = {toc: {file: {}}};

html.onHeading = function(html, data) {
	var heading = data.htmlToDom(html)[0];
	var changed = false;
	Object.keys(heading.attribs).forEach(function(key) {
		if (key === NOTOC || key.indexOf(PREFIX_TOC) === 0) {
			delete heading.attribs[key];
			changed = true;
		}
	});
	if (!changed) {
		return; /* nothing to do */
	}
	return data.domToHtml(heading);
};

json.toc.onTopic = function(topic, data) {
	var heading = data.htmlToDom(data.heading)[0];
	var attributes = heading.attribs;
	if (attributes[NOTOC] !== undefined) {
		return ""; /* do not generate a TOC entry for this header */
	}

	var topicDom = JSON.parse(topic);
	var properties = [];
	Object.keys(attributes).forEach(function(key) {
		if (key.indexOf(PREFIX_TOC) === 0) {
			var name = key.substring(PREFIX_TOC.length);
			properties.push({name: name, value: attributes[key]});
		}
	});

	var changed;
	if (properties.length) {
		topicDom.properties = properties;
		changed = true;
	}

	var unescapedLabel = data.unescape(topicDom.label);
	if (topicDom.label !== unescapedLabel) {
		topicDom.label = unescapedLabel;
		changed = true;
	}

	if (heading.name === "h1") {
		if (data.frontMatterMap.lastupdated) {
			topicDom.lastupdated = data.frontMatterMap.lastupdated;
			changed = true;
		}
	}

	return changed ? JSON.stringify(topicDom) : undefined;
};

json.toc.onComplete = function(json, data) {
	if (!headerText && !footerText) {
		return; /* no change */
	}

	var result = "";
	if (headerText) {
		result += headerText;
	}
	result += json;
	if (footerText) {
		result += footerText;
	}

	return result;
};

function adjustHrefs(obj, pathPrefix) {
	if (obj.href) {
		obj.href = path.join(pathPrefix, obj.href);
	}
	if (obj.topics) {
		obj.topics.forEach(function(current) {
			adjustHrefs(current, pathPrefix);
		});
	}
}

var navgroup;
var lastDestination;

function setTopicIds(object, prefix) {
	if (object.id) {
		object.id = prefix + "-" + object.id;
	}
	(object.topics || []).forEach(function(current) {
		setTopicIds(current, prefix);
	});
}

json.toc.file.onGenerate = function(content, data) {
	var CLASS_TOC = "toc";
	var CLASS_NAVGROUP = "navgroup";
	var CLASS_NAVGROUP_END = "navgroup-end";
	var CLASS_TOPICGROUP = "topicgroup";
	var ATTRIBUTE_CLASS = "class";
	var ATTRIBUTE_ID = "id";
	var ATTRIBUTE_TOPICGROUP_ID = "topicgroup-id";

	var clearNavgroupAtEnd = false;

	if (data.destination !== lastDestination) {
		lastDestination = data.destination;
		navgroup = null;
	}

	if (REGEX_XML_COMMENT.test(content)) {
		return ""; /* explicitly want this to not go through into the generated TOC */
	}

	/* check for .navgroup attribute */
	var classes = data.attributes[ATTRIBUTE_CLASS];
	if (classes) {
		classes = classes.split(" ");
		for (var i = 0; i < classes.length; i++) {
			var className = classes[i].toLowerCase();
			if (className === CLASS_NAVGROUP) {
				classes.splice(i--, 1);
				if (navgroup) {
					logger.warning("Encountered new .navgroup before previous .navgroup '" + navgroup.id + "' was ended (" + data.destination + ")");
				} else {
					var id = data.attributes[ATTRIBUTE_ID];
					if (!id) {
						logger.warning("Encountered .navgroup without an 'id' attribute, on toc item: " + data.source + " (" + data.destination + ")");
					} else {
						navgroup = {id: id, level: data.level};
						delete data.attributes[ATTRIBUTE_ID];
					}
				}
			} else if (className === CLASS_NAVGROUP_END) {
				classes.splice(i--, 1);
				if (!navgroup) {
					logger.warning("Encountered .navgroup-end while not in a previous .navgroup, on toc item: " + data.source + " (" + data.destination + ")");
				}
				clearNavgroupAtEnd = true;
			}
		}
		if (!classes.length) {
			delete data.attributes[ATTRIBUTE_CLASS];
		} else {
			data.attributes[ATTRIBUTE_CLASS] = classes.join(" ");
		}
	}

	if (navgroup && data.level < navgroup.level) {
		logger.warning("Missing .navgroup-end for .navgroup '" + navgroup.id + "' (must be present and at the same indentation level) (" + data.destination + ")");
		navgroup = null;
	}

	var result;

	/* if injecting TOC from a .md file then replace all immediate children with <anchor>s */
	if (/\.md\s*$/.test(data.source)) {
		result = {};
		var obj = {};
		try {
			obj = JSON.parse(content);
		} catch (e) {
			/* very likely a case of a toc file pointing at a non-existent .md file */
			logger.warning("Skipping generation of toc item pointing at '" + data.source + "'.  The target file likely does not exist.");
			result = content;
		}

		Object.keys(obj).forEach(function(key) {
			var child = result[key] = obj[key];
			if (key === "topics") {
				child.forEach(function(topTopic) {
					(topTopic.topics || []).forEach(function(anchorTopic) {
						anchorTopic.properties = anchorTopic.properties || [];
						anchorTopic.properties.splice(0, 0, {name: "type", value: "anchor"});
					});
					
					Object.keys(data.attributes).forEach(function(key) {
						topTopic.properties = topTopic.properties || [];
						topTopic.properties.splice(0, 0, {name: key, value: data.attributes[key]});
					});
					
					if (navgroup && data.level === navgroup.level) {
						topTopic.properties = topTopic.properties || [];
						topTopic.properties.splice(0, 0, {name: "navgroup", value: navgroup.id});
					}
				});
			}
		});
		
		if (data.pathPrefix) {
			adjustHrefs(result, data.pathPrefix);
			setTopicIds(result, data.subcollection || data.pathPrefix);
		}
		
		navgroup = clearNavgroupAtEnd ? null : navgroup;
		return JSON.stringify(result);
	}

	var match = REGEX_LINK.exec(data.source);
	if (match) {
		/* link to external content */
		result = {href: match[2], label: match[1]};
	} else {
		/* check for custom elements this extension knows how to generate */
		var classes = data.attributes[ATTRIBUTE_CLASS];
		if (classes) {
			classes = classes.split(" ");
			for (var i = 0; i < classes.length; i++) {
				var current = classes[i].toLowerCase();
				if (current === CLASS_TOC) {
					result = {toc: {label: data.source}};
					var keys = Object.keys(data.attributes);
					keys.forEach(function(key) {
						if (key.toLowerCase() !== ATTRIBUTE_CLASS) {
							result.toc.properties = result.toc.properties || [];
							result.toc.properties.push({name: key, value: data.attributes[key]});
						}			
					});
					break;
				}
				if (current === CLASS_TOPICGROUP) {
					var properties = [{name: "topicgroup", value: data.source}];
					if (data.attributes[ATTRIBUTE_TOPICGROUP_ID]) {
						properties.push({name: "topicgroup-id", value: data.attributes[ATTRIBUTE_TOPICGROUP_ID]});
					}
					result = {label: data.source, properties: properties};
					break;
				}
			}
		}
	}

	if (result && navgroup && data.level === navgroup.level) {
		var target = result.toc || result;
		target.properties = target.properties || [];
		target.properties.push({name: "navgroup", value: navgroup.id});
	}

	navgroup = clearNavgroupAtEnd ? null : navgroup;
	return result ? JSON.stringify(result) : null;
};

var init = function(data) {
	logger = data.logger;
};

module.exports.id = "jsonTOC";
module.exports.init = init;
module.exports.html = html;
module.exports.json = json;
