# Change Log

This project uses [semantic versioning](http://semver.org/).

## [0.24.0] 2020-11-09
Stop auto-fixing invalid headers.

## [0.23.0] 2020-09-21
Added extension point `styling.code.syntax.getAdditionalLanguages`.

## [0.22.4] 2020-08-05
Added mp4 to the list of file types copied from the source to destination.

## [0.22.3] 2020-07-13
example/videoExt.js: Add support for output='iframe'.

## [0.22.2] 2020-06-17
example/videoExt.js: Act if `video` is present as an attribute or as a class.

## [0.22.1] 2020-06-02
Added example/videoExt.js mime type determination.

## [0.22.0] 2020-06-02
Added example/videoExt.js.

## [0.21.2] 2020-05-27
Update highlight.js dependency.

## [0.21.1] 2020-04-16
Update js-yaml dependency.

## [0.21.0] 2020-04-16
Added support for `topicgroup-id` in examples/jsonTocExt.js.

## [0.20.4] 2020-03-09
Print the version string at startup.

## [0.20.3] 2020-03-07
Picked up the latest marked-it fixes.

## [0.20.2] 2020-03-07
Fixed ALD detection regex.

## [0.20.1] 2019-10-11
Fixed package-lock.json.

## [0.20.0] 2019-10-11
Exposed the core generator's new ability to generate footnotes that follow the syntax described at <https://www.markdownguide.org/extended-syntax/#footnotes>.

## [0.19.1] 2019-09-13
example/accessibilityExt.js: Made generation of table summary text ids deterministic.

## [0.19.0] 2019-08-23
Replace reading of extension init data from conref files to reading it from generic command-line args of form `--@<extensionId>:<name>=<value>`.

## [0.18.1] 2019-08-15
Bug fix for previous release.

## [0.18.0] 2019-08-15
Added passing of `extension-data` from a conref file to extension init() functions.

## [0.17.4] 2019-05-16
example/accessibilityExt.js: Added `aria-describedby` to tables with summary texts.

## [0.17.3] 2019-04-24
example/accessibilityExt.js: Added support for table `summary` attribute.

## [0.17.2] 2019-04-03
Released fixes to a couple of example extensions.

## [0.17.1] 2019-03-27
Released updated package-lock.json.

## [0.17.0] 2019-03-27
Added `escape` and `unescape` functions to the data passed to some types of extensions.

## [0.16.2] 2019-03-26
example/accessibilityExt.js: Added support for table row headers.

## [0.16.1] 2019-03-20
example/accessibilityExt.js: Added support for <figcaption> `caption-side` attribute.

## [0.16.0] 2019-03-19
Picked up the latest marked-it changes, and augment example/accessibilityExt.js.

## [0.15.0] 2019-02-13
Picked up the latest marked-it changes, which include adoption of marked v0.3.9.

## [0.14.2] 2019-02-08
Picked up the latest marked-it fixes.

## [0.14.1] 2019-01-28
Added checking of the `file.dir.shouldProcess` extension point during TOC generation.

## [0.14.0] 2019-01-23
Added extension points `file.dir.shouldProcess`, `file.md.shouldGenerate` and `file.shouldCopy`.

## [0.13.7] 2019-01-15
Changed how topic ids are computed, to use `subcollection`.

## [0.13.6] 2018-12-07
Fixed: Variables defined in front matter are not being substituted into generated headers/footers.

## [0.13.2 - 0.13.5] 2018-11-21
Fixed the computation of a TOC id's root folder segment.

## [0.13.1] 2018-11-20
Added 'id' attributes on TOC topics.

## [0.13.0] 2018-11-07
Modified creation of toc links to folders that do not exist locally.

## [0.12.0] 2018-10-30
Enabled creation of toc links to folders that do not exist locally if the link path is absolute.

## [0.11.0] 2018-10-16
Added a `path` attribute on the `data` object that gets passed to `xml.toc.file.onGenerate` and `json.toc.file.onGenerate` extension implementations. The "examples" extensions that implement these extension points now prefix generated hrefs with the received path value.

## [0.10.8] 2018-10-11
Unescape topic labels in JSON TOCs.

## [0.10.7] 2018-10-11
Consume the latest marked-it-core.

## [0.10.6] 2018-10-05
Modified example/generateSectionsExt.js to move header attributes into containing section element.

## [0.10.5] 2018-09-26
Consume the latest marked-it-core.

## [0.10.4] 2018-09-24
Added example/generateSectionsExt.js.

## [0.10.3] 2018-08-13
Fix the CHANGELOG.

## [0.10.2] 2018-08-13
Bump up required version of marked-it-core package.

## [0.10.1] 2018-08-13
Merged fixes for example/makeApidocsJson.js.

## [0.10.0] 2018-08-13
### New features
Support has been added for generating TOCs in JSON format.  To use this, specify command-line arguments `--toc-json --extension-file=./example/jsonTocExt.js`, and **toc.json** files will be written for directories whose source contains a toc file.

There is also a new extension point, `json.toc.file.onGenerate`, which is analagous to the existing `xml.toc.file.onGenerate` extension point.

## [0.9.7] 2018-06-25
Merged fix for example/makeApidocsJson.js.

## [0.9.6] 2018-06-12
Added example/makeApidocsJson.js.

## [0.9.5] 2018-05-10
Fix to skip processing of hidden folders/files.

## [0.9.4] 2018-04-18
Fix to eliminate generation of `<property name="class" value=""/>` elements in toc.xml files.

## [0.9.2] 2018-04-03
Update to example/xmlTocExt.js.

## [0.9.1] 2017-06-27
### New features
Code blocks that identify a source language are now marked up with [highlight.js](https://www.npmjs.com/package/highlight.js) so that they can
render with syntax highlighting.  For example, markdown source:
	```python
	s = "Python syntax highlighting"
	print s
	```

will generate to HTML as:

	<pre>
	<code class="lang-python hljs">
	s = <span class="hljs-string">"Python syntax highlighting"</span>
	<span class="hljs-keyword">print</span> s
	</code>
	</pre>


## [0.9.0] 2017-06-05
### New features
#### Improved toc file nesting
Nesting of items in toc files can now be specified with '>' characters instead of whitespace.  This was done because the previous reliance on whitespace proved to not be reliable, as specified whitespace was not always preserved by copy/paste operations and by display in some web clients.

The following is done to determine the indentation level for a line in a toc file:
1. Capture all leading space and ‘>’ chars.
2. If there are any ‘>’ chars in there then count the number of ‘>’ chars to determine that item’s level.  All contained spaces are consequently considered to be meaningless (useful for formatting only).
3. If there are no ‘>’ chars in there then use the previous approach of counting the number of leading spaces.

The following four hierarchies are equivalent.  They demonstrate different approaches that can be used to define toc file lines with varying hierarchy  readability.

```
root1 (spaces only)
    child1
            childTooDeepError
    child2
        child21
            child211
        child 22

root2 ('>' only)
>child1
>>>childTooDeepError
>child2
>>child21
>>>child211
>>child 22

root3 (all '>' at beginning, spaces are ignored but help with readability)
>    child1
>>>            childTooDeepError
>    child2
>>        child21
>>>            child211
>>        child 22

root4 ('>' at each level, spaces are ignored but help with readability)
>    child1
>    >    >    childTooDeepError
>    child2
>    >    child21
>    >    >    child211
>    >    child 22
```


## [0.8.0] 2017-05-07
Initial release
