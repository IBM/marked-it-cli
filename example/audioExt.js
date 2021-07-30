/**
 * marked-it-cli
 *
 * Copyright (c) 2020 IBM Corporation
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

 /*
  * Example of referencing audio:
  * 
  * Other audio:
  * ![Testing audio extension](example/audio.mp3){: audio controls loop muted preload type="audio/ogg"}
  */

const url = require('url');
var html = {};
var logger;

const MIME_TYPES = {
	"au": "audio/basic",
    "snd": "audio/basic",
    "Linear PCM": "audio/basic",
    "mid": "audio/mid",
    "rmi": "audio/mid",
    "mp3": "audio/mpeg",
    "mp4 audio": "audio/mp4",
    "aif": "audio/x-aiff",
    "aifc": "audio/x-aiff",
    "aiff": "audio/x-aiff",
    "m3u": "audio/x-mpegurl",
    "ra": "audio/vnd.rn-realaudio",
    "ram": "audio/vnd.rn-realaudio",
    "Ogg Vorbis": "audio/ogg",
    "Vorbis": "audio/vorbis",
	"wav": "audio/vnd.wav",
}

html.onImage = function(html, data) {
	var image = data.htmlToDom(html)[0];
	if (!(image.attribs["audio"] !== undefined || (image.attribs["class"] || "").split(" ").indexOf("audio") !== -1)) {
		return; /* nothing to do */
	}

	var src = image.attribs["src"];
	if (!src) {
		logger.warning("Encountered a audio element that was missing the mandatory `src` attribute, so did NOT generate a audio tag for it");
		return;
	}

	if (image.attribs["class"]) {
		var segments = image.attribs["class"].split(" ");
		var index = segments.indexOf("audio");
		if (index !== -1) {
			segments.splice(index, 1);
			if (segments.length) {
				image.attribs["class"] = segments.join(" ");
			} else {
				delete image.attribs["class"];
			}
		}
	}
	delete image.attribs["audio"];
	delete image.attribs["src"];

	var alt = image.attribs["alt"];
	delete image.attribs["alt"];

	var output = image.attribs["output"];
	if (output === "iframe") {
		delete image.attribs["output"];
		var frame = data.htmlToDom(`<iframe src="${src}"></iframe>`)[0];
		if (alt) {
			frame.attribs["title"] = alt;
		}
		/* copy any remaining attributes into the <iframe> as-is */
		Object.keys(image.attribs).forEach(function(key) {
			frame.attribs[key] = image.attribs[key];
		});
		return data.domToHtml(frame);
	}

	var audio = data.htmlToDom(`<audio><source src="${src}">Your browser does not support the audio tag.</audio>`)[0];
	if (alt) {
		audio.attribs["title"] = alt;
	}

	/*
	 * Use the provided type if there is one, and otherwise try to determine it based on the extension.
	 */
	var type = image.attribs["type"];
	delete image.attribs["type"];
	if (!type) {
		var filename = src; /* default */
		try {
			var urlObj = new url.URL(src);
			filename = urlObj.pathname;
		} catch (e) {
			/*
			 * The src is not an url, so just try it as a filename, which is the default anyways.
			 */
		}
		var extension = filename.substring(filename.lastIndexOf(".") + 1);
		type = MIME_TYPES[extension];
	}
	if (type) {
		audio.children[0].attribs["type"] = type;
	}

	/* copy any remaining attributes into the <audio> as-is */
	Object.keys(image.attribs).forEach(function(key) {
		audio.attribs[key] = image.attribs[key];
	});
	return data.domToHtml(audio);
};

var init = function(data) {
	logger = data.logger;
}

module.exports.id = "audioExt";
module.exports.html = html;
module.exports.init = init;
