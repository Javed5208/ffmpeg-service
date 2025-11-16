import express from "express";
import morgan from "morgan";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "uuid";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper download
async function downloadToTmp(url, ext) {
  const id = randomUUID();
  const filePath = `/tmp/${id}.${ext}`;

  const writer = fs.createWriteStream(filePath);
  const response = await axios({ url, method: "GET", responseType: "stream" });

  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return filePath;
}

function sanitizeDrawtext(text = "") {
  return text
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\\/g, "\\\\");
}

app.post("/render", async (req, res) => {
  try {
    const { video_url, text_top = "", text_bottom = "", arrow_image_url, audio_url } = req.body;

    if (!video_url) {
      return res.status(400).json({ error: "video_url is required" });
    }

    const videoFile = await downloadToTmp(video_url, "mp4");
    const audioFile = audio_url ? await downloadToTmp(audio_url, "mp3") : null;
    const arrowFile = arrow_image_url ? await downloadToTmp(arrow_image_url, "png") : null;

    const outId = randomUUID();
    const outputPath = `/tmp/${outId}.mp4`;

    const safeTop = sanitizeDrawtext(text_top);
    const safeBottom = sanitizeDrawtext(text_bottom);

    let filter =
      "[0:v]scale=1080:1920:force_original_aspect_ratio=cover," +
      "crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2[v0]";

    if (safeTop) {
      filter += `;[v0]drawtext=text='${safeTop}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=80:box=1:boxcolor=black@0.5:boxborderw=10[v1]`;
    } else {
      filter += ";[v0]copy[v1]";
    }

    if (safeBottom) {
      filter += `;[v1]drawtext=text='${safeBottom}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-150:box=1:boxcolor=black@0.5:boxborderw=10[v2]`;
    } else {
      filter += ";[v1]copy[v2]";
    }

    if (arrowFile) {
      filter += ";[v2][2:v]overlay=x=W-w-120:y=H-h-220[vout]";
    } else {
      filter += ";[v2]copy[vout]";
    }

    const args = ["-y", "-i", videoFile];

    if (audioFile) args.push("-i", audioFile);
    if (arrowFile) args.push("-i", arrowFile);

    args.push("-filter_complex", filter);
    args.push("-map", "[vout]");

    if (audioFile) args.push("-map", "1:a");
    else args.push("-map", "0:a?");

    args.push("-shortest", "-preset", "ultrafast", outputPath);

    const ff = spawn("ffmpeg", args);

    ff.stderr.on("data", (x) => console.log(x.toString()));

    ff.on("close", () => {
      const publicBase = process.env.PUBLIC_BASE_URL || "";
      return res.json({
        status: "ok",
        video_url: `${publicBase}/files/${outId}.mp4`,
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/files/:id", (req, res) => {
  const filepath = `/tmp/${req.params.id}`;
  if (!fs.existsSync(filepath)) return res.status(404).send("Not found");
  res.sendFile(filepath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running", PORT));
