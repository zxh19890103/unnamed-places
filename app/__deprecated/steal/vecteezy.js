const https = require("https");
const fs = require("node:fs");
const { join } = require("node:path");
// const cheerio = require("cheerio");

const { createWriteStream } = fs;

const cat = "plants.oriental-plane";

const thumbnailsStr = fs.readFileSync(`./vecteezy.${cat}.json`, "utf8");
const thumbnails = JSON.parse(thumbnailsStr);
const folder2save = `./data-vecteezy/${cat}`;
const page = 1;

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

download();
