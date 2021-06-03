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

 const fs = require("fs");
 const htmlparser = require("htmlparser2");
 
 function domToHtml(dom, options) {
   return htmlparser.DomUtils.getOuterHTML(dom, options || {});
 }
 
 function domToInnerHtml(dom, options) {
   return htmlparser.DomUtils.getInnerHTML(dom, options || {});
 }
 
 function htmlToDom(string, options) {
   let result;
   const handler = new htmlparser.DomHandler(function (error, dom) {
     if (error) {
       console.log("*** Failed to parse HTML:\n" + error.toString());
     } else {
       result = dom;
     }
   });
   const parser = new htmlparser.Parser(handler, options || {});
   parser.write(string.trim());
   parser.done();
 
   return result;
 }
 
 function invokeExtensions(extensions, id, value, data) {
   if (!extensions) {
     return value;
   }
 
   const endNL = /(\r\n|\r|\n)$/.exec(value);
 
   let current = extensions;
   const segments = id.split(".");
   for (let i = 0; current && i < segments.length; i++) {
     current = current[segments[i]];
   }
 
   if (current) {
     let extensionsArray;
     if (current instanceof Array) {
       extensionsArray = current;
     } else if (current instanceof Function) {
       extensionsArray = [current];
     }
 
     if (extensionsArray) {
       extensionsArray.forEach(function (current) {
         const result = current(value, data);
         if (typeof (result) === typeof (value)) {
           value = result;
         }
       });
     }
   }
 
   if (value && endNL && !(new RegExp(endNL[1] + "$")).test(value)) {
     value += endNL[1];
   }
   return value;
 }
 
 function readFile(fd) {
   if (typeof (fd) !== "number") {
     return null;
   }
 
   const readStat = fs.fstatSync(fd);
   const readBlockSize = readStat.blksize || 4096;
   const fileSize = readStat.size;
   if (!fileSize) {
     return "";
   }
   const inBuffer = Buffer.alloc(fileSize);
   let totalReadCount = 0;
   do {
     const length = Math.min(readBlockSize, fileSize - totalReadCount);
     const readCount = fs.readSync(fd, inBuffer, totalReadCount, length, null);
     if (!readCount) {
       break;
     }
     totalReadCount += readCount;
   } while (totalReadCount < fileSize);
   if (totalReadCount !== fileSize) {
     return null;
   }
   let result = inBuffer.toString("utf8", 0, inBuffer.length);
   result = result.replace(/^\uFEFF/, ""); /* strip contained BOM characters */
   return result;
 }
 
 function escape(string, encode) {
   return (string || "")
     .replace(!encode ? /&(?!#?\w+;)/g : /&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;')
     .replace(/'/g, '&#39;');
 }
 
 function unescape(string) {
   return (string || "")
     .replace(/&lt;/g, '<')
     .replace(/&gt;/g, '>')
     .replace(/&quot;/g, '"')
     .replace(/&amp;/g, '&')
     .replace(/&#39;/g, "'");
 }
 
 function writeFile(fd, buffer) {
   const writeStat = fs.fstatSync(fd);
   const writeBlockSize = writeStat.blksize || 4096;
   let totalWriteCount = 0;
   do {
     const length = Math.min(writeBlockSize, buffer.length - totalWriteCount);
     const writeCount = fs.writeSync(fd, buffer, totalWriteCount, length, null);
     if (!writeCount) {
       return false;
     }
     totalWriteCount += writeCount;
   } while (totalWriteCount < buffer.length);
   return true;
 }
 
 module.exports.domToHtml = domToHtml;
 module.exports.domToInnerHtml = domToInnerHtml;
 module.exports.htmlToDom = htmlToDom;
 module.exports.domUtils = htmlparser.DomUtils;
 module.exports.invokeExtensions = invokeExtensions;
 module.exports.readFile = readFile;
 module.exports.escape = escape;
 module.exports.unescape = unescape;
 module.exports.writeFile = writeFile;
