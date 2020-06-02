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
  * Examples of referencing videos:
  *
  * YouTube video:
  * ![Watson Assistant product overview](https://www.youtube.com/embed/h-u-5f8fZtc?rel=0){: video width="640" height="390"}
  * 
  * Other video:
  * ![Watson Assistant product overview](video.mp4){: video type="video/mp4" width="640" height="390" controls}
  */

const url = require('url');
var html = {};
var logger;

html.onImage = function(html, data) {
	var image = data.htmlToDom(html)[0];
	if (!image.attribs["video"]) {
		return; /* nothing to do */
	}

	var src = image.attribs["src"];
	if (!src) {
		logger.warning("Encountered a video element that was missing the mandatory `src` attribute, so did NOT generate a video tag for it");
		return;
	}

	delete image.attribs["video"];
	delete image.attribs["src"];

	var alt = image.attribs["alt"];
	delete image.attribs["alt"];
	var type = image.attribs["type"];
	delete image.attribs["type"];

	var isYouTube = false; /* default */
	try {
		var urlObj = new url.URL(src);
		isYouTube = urlObj.host.toLowerCase().indexOf("youtube") !== -1;
	} catch (e) {
		/*
		 * The src is not an url, which is valid, it could be a relative path.
		 * Regardless, it's obviously not a YouTube link, so just carry on.
		 */
	}

	if (isYouTube) {
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

	var video = data.htmlToDom(`<video><source src="${src}">Your browser does not support the video tag.</video>`)[0];
	if (alt) {
		video.attribs["title"] = alt;
	}
	if (type) {
		video.children[0].attribs["type"] = type;
	}
	/* copy any remaining attributes into the <video> as-is */
	Object.keys(image.attribs).forEach(function(key) {
		video.attribs[key] = image.attribs[key];
	});
	return data.domToHtml(video);
};

var init = function(data) {
	logger = data.logger;
}

module.exports.id = "videoExt";
module.exports.html = html;
module.exports.init = init;
