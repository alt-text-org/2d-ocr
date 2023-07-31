const vision = require("@google-cloud/vision");
const path = require("path");
const fastify = require("fastify")({
  logger: false,
  bodyLimit: 10 * 1024 * 1024
});

fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "site"),
  prefix: "/",
});

fastify.register(require("@fastify/rate-limit"), {
  max: 60,
  timeWindow: "1 minute",
});

const visionClient = new vision.ImageAnnotatorClient();

fastify.get("/", (request, reply) => {
  reply.sendFile("index.html");
});

fastify.post("/api/ocr", async (request, reply) => {
  const ocrRequest = {
    image: {
      content: Buffer.from(request.body, "base64"),
    },
  };

  let [result] = await visionClient.textDetection(ocrRequest).catch((err) => {
    console.log(err);
    return [];
  });

  console.log(JSON.stringify(result))
  reply.code(200);
  reply.send(processResult(result));
});

function processResult(result) {
  if (!result) {
    return [];
  }
  const { pages } = result.fullTextAnnotation;
  const paragraphs = [];
  pages.forEach((page) => {
    page.blocks.forEach((block) => {
      if (block.blockType === "TEXT") {
        block.paragraphs.forEach((p) => {
          paragraphs.push({
            text: collapseParagraph(p),
            box: getBoundingRect(p),
          });
        });
      }
    });
  });

  return paragraphs;
}

function collapseParagraph(p) {
  return p.words
    .map((word) => word.symbols.map((s) => s.text).join(""))
    .join(" ");
}

function getBoundingRect(block) {
  let xs = block.boundingBox.vertices.map((v) => v.x);
  let ys = block.boundingBox.vertices.map((v) => v.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    left: minX,
    top: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

fastify.listen(
  { port: process.env.PORT || 0, host: "0.0.0.0" },
  function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
  }
);
