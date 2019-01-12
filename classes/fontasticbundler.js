const imports = {
  "path": require("path"),
  "fs": require("fs"),
  "axios": require("axios"),
  "css": require("css"),
  "mkdirp": require("mkdirp"),
  "syncRequest": require("sync-request"),
  "Logger": require("@considonet/g-logger")
};

class FontasticBundler {

  constructor(logVerbosity = 1) {

    this.logger = new imports.Logger("fontastic-bundler", logVerbosity);
    this.cssUrlScheme = "https://file.myfontastic.com/{id}/icons.css";

  }

  bundle(fontasticId, cssDir, fontsDir, scssFile) {

    const url = this.cssUrlScheme.replace(/{id}/g, fontasticId);
    this.logger.log(`Fetching stylesheet file from ${url}...`, 1);

    imports.axios({
      url
    }).then(response => {

      this.logger.log(`Parsing the CSS file...`, 3);
      const css = imports.css.parse(response.data).stylesheet.rules;

      // Locating the @font-face definition
      let fontName = null;
      const fontSrcs = [];
      const iconDefs = [];

      // Detecting the class prefix
      let classPrefix = "icon-";

      css.some(rule => {

        if (rule.type === "rule") {

          if(rule.selectors[0].match(/\[class\^="/g)) {
            classPrefix = rule.selectors[0].split(`"`)[1];
            this.logger.log(`Detected CSS class prefix: ${classPrefix}`, 3);
            return true;
          }

        }

      });

      // Preparing regexps
      const ruleSelRegexp = new RegExp(`\\.${classPrefix}`);
      const idFetchRegexp = new RegExp(`(\\.${classPrefix})|(:before)`, "g");

      // Parsing the CSS
      css.forEach(rule => {

        if(rule.type==="font-face") {

          rule.declarations.forEach(declaration => {

            if(declaration.property==="font-family") {

              fontName = declaration.value.replace(/['"]/g, "");
              this.logger.log(`Font name detected: ${fontName}`, 3);

            } else if(declaration.property==="src") {

              const src = declaration.value;
              fontSrcs.push(src);
              this.logger.log(`Font src detected: ${src}`, 3);

            }

          });

        } else if(rule.type==="rule" && rule.selectors.some( selector => selector.match(ruleSelRegexp))) {

          const id = rule.selectors[0].replace(idFetchRegexp, "");
          const code = rule.declarations[0].value.replace(/['"]/g, "");

          this.logger.log(`Icon ${id} registered with code ${code}`, 3);

          iconDefs.push({
            id, code
          });

        }

      });

      if(fontSrcs.length>0) {

        this.logger.log(`Downloading the fonts...`, 1);

        // Preparing the URL switch and collecting the data
        let fileRelativePath = "." + fontsDir.replace(cssDir, "");

        const downloadUrls = [];
        const tmpDownloadList = [];

        const newSrcs = fontSrcs.map(src => src.replace(/url\(['"](.+?)['"]\)/g, (match, url) => {

          // Replacing the URL with the local one
          const urlSplit = url.split("/");
          let fileName = urlSplit.splice(-1, 1)[0];
          const path = urlSplit.join("/");

          // Suffix support - ? or #
          const suffixArr = /[?#].*$/.exec(fileName);
          let suffix = "";
          if(suffixArr !== null) {
            suffix = suffixArr[0];
            fileName = fileName.replace(/[?#].*$/, "");
          }

          const ext = fileName.split(".")[1];
          const newUrl = `${fileRelativePath}/${fontName}.${ext}${suffix}`;

          // Adding to the download list
          const cleanUrl = url.replace(/[?#].*$/g, "");
          if(tmpDownloadList.indexOf(cleanUrl)===-1) {
            downloadUrls.push({
              src: cleanUrl,
              dest: imports.path.join(fontsDir, `${fontName}.${ext}`)
            });
            tmpDownloadList.push(cleanUrl);
          }

          return `url("${newUrl}")`;

        }));

        // Creating the dir if necessary
        imports.mkdirp.sync(fontsDir);

        // Downloading
        downloadUrls.forEach(dl => {
          this.logger.log(`Downloading from ${dl.src}`, 3);

          const res = imports.syncRequest("GET", dl.src);
          imports.fs.writeFileSync(imports.path.normalize(dl.dest), res.getBody(null), { encoding: null });
        });

        // Saving the SCSS file
        this.logger.log(`Saving SCSS to ${scssFile}`, 1);
        const scssTemplate = `// File generated automatically with GBuild. All manual changes will be lost after running 'gbuild fontastic'!
        @font-face { font-family: "icons"; font-weight: normal; font-style: normal; {{srcs}}}
@mixin fIcon() { font-family: "icons" !important; font-style: normal !important; font-weight: normal !important; font-variant: normal !important; text-transform: none !important; speak: none; line-height: 1; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
[data-icon]:before { content: attr(data-icon); @include fIcon(); }
[class^="${classPrefix}"]:before, [class*=" ${classPrefix}"]:before { @include fIcon(); }
$icons: (
{{icons}}
);
@each $name, $content in $icons { .${classPrefix}#{$name}::before { content: $content; }}
@mixin icon($name, $styles: false) { @if($styles==true) { @include fIcon(); } content: map_get($icons, $name); }`;

        let srcsStr = newSrcs.map(src => `src:${src};`).join("\n");
        let iconsStr = iconDefs.map(def => `${def.id}:"${def.code}"`).join(",\n");

        imports.fs.writeFileSync(imports.path.normalize(scssFile), scssTemplate.replace("{{srcs}}", srcsStr).replace("{{icons}}", iconsStr));

      } else {
        this.logger.error("No font sources found");
      }

    }).catch(e => {
      this.logger.error(`Downloading CSS from Fontastic cloud failed: ${e.message}`);
    });

  }

}

module.exports = FontasticBundler;
