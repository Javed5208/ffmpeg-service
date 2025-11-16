import express from "express";
import morgan from "morgan";
import axios from "axios";
import { spawn } from "child_process";
import { createWriteStream, existsSync, statSync, createReadStream } from "fs";
import { randomUUID } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: download file to /tmp
async function downloadToTmp(url, ext) {
  const id = randomUUID();
  const filePath = path.join("/tmp", `${id}.${ext}`);
  const writer = createWriteStream(filePath);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return filePath;
}

// Helper: sanitize text for ffmpeg drawtext
function sanitizeDrawtext(text = "") {
  return text
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\\/g, "\\\\");
}

// POST /render
app.post("/render", async (req, res) => {
  const {
    video_url,
    text_top = "",
    text_bottom = "",
    arrow_image_url,
    audio_url,
  } = req.body || {};

  if (!video_url) {
    return res.status(400).json({ error: "video_url is required" });
  }

  try {
    // 1. Download inputs
    const inputVideo = await downloadToTmp(video_url, "mp4");
    let inputAudio = null;
    let inputArrow = null;

    if (audio_url) {
      inputAudio = await downloadToTmp(audio_url, "mp3");
    }

    if (arrow_image_url) {
      inputArrow = await downloadToTmp(arrow_image_url, "png");
    }

    const outId = randomUUID();
    const outputPath = path.join("/tmp", `${outId}.mp4`);

    const args = ["-y", "-i", inputVideo];

    let hasAudio = false;
    let hasArrow = false;

    if (audio_url && inputAudio) {
      args.push("-i", inputAudio);
      hasAudio = true;
    }

    if (arrow_image_url && inputArrow) {
      args.push("-i", inputArrow);
      hasArrow = true;
    }

    const safeTop = sanitizeDrawtext(text_top);
    const safeBottom = sanitizeDrawtext(text_bottom);

    let filter =
      "[0:v]scale=1080:1920:force_original_aspect_ratio=cover," +
      "crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2[v0]";

    if (safeTop) {
      filter +=
        `;[v0]drawtext=text='${safeTop}':fontcolor=white:fontsize=52:` +
        "x=(w-text_w)/2:y=80:box=1:boxcolor=black@0.5:boxborderw=10[v1]";
    } else {
      filter += ";[v0]copy[v1]";
    }

    if (safeBottom) {
      filter +=
        `;[v1]drawtext=text='${safeBottom}':fontcolor=white:fontsize=40:` +
        "x=(w-text_w)/2:y=h-140:box=1:boxcolor=black@0.5:boxborderw=10[v2]";
    } else {
      filter += ";[v1]copy[v2]";
    }

    if (hasArrow) {
      filter += ";[v2][2:v]overlay=x=W-w-120:y=H-h-220[vout]";
    } else {
      filter += ";[v2]copy[vout]";
    }

    args.push("-filter_complex", filter);

    if (hasAudio) {
      args.push("-map", "[vout]", "-map", "1:a", "-shortest");
    } else {
      args.push("-map", "[vout]", "-map", "0:a?", "-shortest");
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath
    );

    console.log("FFmpeg args:", args.join(" "));

    const ff = spawn("ffmpeg", args);

    ff.stderr.on("data", (data) => {
      console.log("[ffmpeg]", data.toString());
    });

    await new Promise((resolve, reject) => {
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error("ffmpeg exited with code " + code));
      });
    });

    const publicBase = process.env.PUBLIC_BASE_URL || "";
    const fileUrl = publicBase
      ? `${publicBase}/files/${outId}.mp4`
      : `/files/${outId}.mp4`;

    return res.json({
      status: "ok",
      video_url: fileUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: err.message || "Render failed",
    });
  }
});

app.get("/files/:id", (req, res) => {
  const id = req.params.id;
  const filePath = path.join("/tmp", `${id}.mp4`);

  if (!existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  const stat = statSync(filePath);
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": stat.size,
  });
  const readStream = createReadStream(filePath);
  readStream.pipe(res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("FFmpeg render service listening on port", PORT);
});    const args = ["-y", "-i", inputVideo];

    let hasAudio = false;
    let hasArrow = false;

    if (audio_url && inputAudio) {
      args.push("-i", inputAudio);
      hasAudio = true;
    }

    if (arrow_image_url && inputArrow) {
      args.push("-i", inputArrow);
      hasArrow = true;
    }

    const safeTop = sanitizeDrawtext(text_top);
    const safeBottom = sanitizeDrawtext(text_bottom);

    let filter =
      "[0:v]scale=1080:1920:force_original_aspect_ratio=cover," +
      "crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2[v0]";

    if (safeTop) {
      filter +=
        `;[v0]drawtext=text='${safeTop}':fontcolor=white:fontsize=52:` +
        "x=(w-text_w)/2:y=80:box=1:boxcolor=black@0.5:boxborderw=10[v1]";
    } else {
      filter += ";[v0]copy[v1]";
    }

    if (safeBottom) {
      filter +=
        `;[v1]drawtext=text='${safeBottom}':fontcolor=white:fontsize=40:` +
        "x=(w-text_w)/2:y=h-140:box=1:boxcolor=black@0.5:boxborderw=10[v2]";
    } else {
      filter += ";[v1]copy[v2]";
    }

    if (hasArrow) {
      filter += ";[v2][2:v]overlay=x=W-w-120:y=H-h-220[vout]";
    } else {
      filter += ";[v2]copy[vout]";
    }

    args.push("-filter_complex", filter);

    if (hasAudio) {
      args.push("-map", "[vout]", "-map", "1:a", "-shortest");
    } else {
      args.push("-map", "[vout]", "-map", "0:a?", "-shortest");
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath
    );

    console.log("FFmpeg args:", args.join(" "));

    const ff = spawn("ffmpeg", args);

    ff.stderr.on("data", (data) => {
      console.log("[ffmpeg]", data.toString());
    });

    await new Promise((resolve, reject) => {
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error("ffmpeg exited with code " + code));
      });
    });

    const publicBase = process.env.PUBLIC_BASE_URL || "";
    const fileUrl = publicBase
      ? `${publicBase}/files/${outId}.mp4`
      : `/files/${outId}.mp4`;

    return res.json({
      status: "ok",
      video_url: fileUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: err.message || "Render failed",
    });
  }
});

app.get("/files/:id", (req, res) => {
  const id = req.params.id;
  const filePath = path.join("/tmp", `${id}.mp4`);

  if (!existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  const stat = statSync(filePath);
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": stat.size,
  });
  const readStream = createReadStream(filePath);
  readStream.pipe(res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("FFmpeg render service listening on port", PORT);
});
    if (audio_url) {
      inputAudio = await downloadToTmp(audio_url, "mp3");
    }

    if (arrow_image_url) {
      inputArrow = await downloadToTmp(arrow_image_url, "png");
    }

    const outId = randomUUID();
    const outputPath = path.join("/tmp", `${outId}.mp4`);

    const args = ["-y", "-i", inputVideo];

    let hasAudio = false;
    let hasArrow = false;

    if (audio_url && inputAudio) {
      args.push("-i", inputAudio);
      hasAudio = true;
    }

    if (arrow_image_url && inputArrow) {
      args.push("-i", inputArrow);
      hasArrow = true;
    }

    const safeTop = sanitizeDrawtext(text_top);
    const safeBottom = sanitizeDrawtext(text_bottom);

    let filter =
      "[0:v]scale=1080:1920:force_original_aspect_ratio=cover," +
      "crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2[v0]";

    if (safeTop) {
      filter +=
        `;[v0]drawtext=text='${safeTop}':fontcolor=white:fontsize=52:` +
        "x=(w-text_w)/2:y=80:box=1:boxcolor=black@0.5:boxborderw=10[v1]";
    } else {
      filter += ";[v0]copy[v1]";
    }

    if (safeBottom) {
      filter +=
        `;[v1]drawtext=text='${safeBottom}':fontcolor=white:fontsize=40:` +
        "x=(w-text_w)/2:y=h-140:box=1:boxcolor=black@0.5:boxborderw=10[v2]";
    } else {
      filter += ";[v1]copy[v2]";
    }

    if (hasArrow) {
      filter += ";[v2][2:v]overlay=x=W-w-120:y=H-h-220[vout]";
    } else {
      filter += ";[v2]copy[vout]";
    }

    args.push("-filter_complex", filter);

    if (hasAudio) {
      args.push("-map", "[vout]", "-map", "1:a", "-shortest");
    } else {
      args.push("-map", "[vout]", "-map", "0:a?", "-shortest");
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath
    );

    console.log("FFmpeg args:", args.join(" "));

    const ff = spawn("ffmpeg", args);

    ff.stderr.on("data", (data) => {
      console.log("[ffmpeg]", data.toString());
    });

    await new Promise((resolve, reject) => {
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error("ffmpeg exited with code " + code));
      });
    });

    const publicBase = process.env.PUBLIC_BASE_URL || "";
    const fileUrl = publicBase
      ? `${publicBase}/files/${outId}.mp4`
      : `/files/${outId}.mp4`;

    return res.json({
      status: "ok",
      video_url: fileUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: err.message || "Render failed",
    });
  }
});

app.get("/files/:id", (req, res) => {
  const id = req.params.id;
  const filePath = path.join("/tmp", `${id}.mp4`);

  if (!existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  const stat = statSync(filePath);
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": stat.size,
  });
  const readStream = createReadStream(filePath);
  readStream.pipe(res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("FFmpeg render service listening on port", PORT);
});
