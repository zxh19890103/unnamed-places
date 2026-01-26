const https = require("https");
const fs = require("node:fs");
const { join } = require("node:path");
const cheerio = require("cheerio");

const { createWriteStream } = fs;

const cat = "plants.populus";

const thumbnailsStr = fs.readFileSync(`./vecteezy.${cat}.json`, "utf8");
const thumbnails = JSON.parse(thumbnailsStr);
const folder2save = `./data-vecteezy/${cat}`;
const page = 1;
const search = "tree spring texture";

if (!fs.existsSync(folder2save)) {
  fs.mkdirSync(folder2save, { recursive: true });
}

const count = thumbnails.length;

let i = 0;

const download = () => {
  const url = thumbnails[i];

  if (url === undefined) {
    console.log("all are loaded!");
    return;
  }

  const saveto = join(folder2save, `./${page}-${i}.png`);

  if (fs.existsSync(saveto)) {
    console.log("skip", saveto);
    i++;
    download();
    return;
  }

  const file = createWriteStream(saveto);

  console.log(`download: ${i} / ${count}`, url);

  https
    .get(url, (res) => {
      console.log(`incom... ${i} / ${count}`);
      res
        .pipe(file)
        .on("finish", () => {
          console.log(`saved:  ${i} / ${count}`, url);
          i++;
          download();
        })
        .on("error", (err_) => {
          console.log(err_);
          console.log(i);
        });
    })
    .on("error", (err_) => {
      console.log(err_);
      console.log(i);
    });
};

const parseHtml = (cb) => {
  const keywords = search.replace(/ /g, "-");

  https.get(
    `https://www.vecteezy.com/search?qterm=${keywords}&content_type=png&page=${page}`,
    (incom) => {
      let buffer = Buffer.alloc(0);

      incom.on("data", (chunk) => {
        buffer = Buffer.concat(buffer, chunk);
      });

      incom.on("end", () => {
        console.log(buffer.toString("utf8"));
        const $ = cheerio.loadBuffer(buffer, { encoding: "utf8" });

        $(
          ".ez-resource-grid.ez-resource-grid--main-grid > li.ez-resource-grid__item > a > img",
        ).each((i, element) => {
          console.log(element.attribs["src"]);
        });

        // cb();
      });
    },
  );
};

download();
// parseHtml(download);
