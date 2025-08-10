import AWS from "aws-sdk";
import { Readable } from "stream";
import axios from "axios";
import fs from "fs";

// 配置Cloudflare R2（S3兼容）
AWS.config.update({
  accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
  secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
});

// 创建S3客户端，指向Cloudflare R2
const s3 = new AWS.S3({
  endpoint: process.env.CLOUDFLARE_ENDPOINT,
  region: 'auto',  // Cloudflare R2使用'auto'
  s3ForcePathStyle: true,  // 重要：强制使用路径样式
});

export async function downloadAndUploadImage(
  imageUrl: string,
  bucketName: string,
  s3Key: string
) {
  try {
    const response = await axios({
      method: "GET",
      url: imageUrl,
      responseType: "stream",
    });

    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: response.data as Readable,
    };

    const result = await s3.upload(uploadParams).promise();
    
    // 直接构造正确的Public Development URL
    // 确保s3Key不包含bucket名称
    const cleanKey = s3Key.startsWith(`${bucketName}/`) ? s3Key.substring(`${bucketName}/`.length) : s3Key;
    const publicUrl = `https://pub-b3b0705070114d239cfb5b06f7130d0c.r2.dev/${cleanKey}`;
    
    console.log(`Original Location: ${result.Location}`);
    console.log(`Generated Public URL: ${publicUrl}`);
    
    return {
      ...result,
      Location: publicUrl
    };
  } catch (e) {
    console.log("upload failed:", e);
    throw e;
  }
}

export async function downloadImage(imageUrl: string, outputPath: string) {
  try {
    const response = await axios({
      method: "GET",
      url: imageUrl,
      responseType: "stream",
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      let error: Error | null = null;
      writer.on("error", (err) => {
        error = err;
        writer.close();
        reject(err);
      });

      writer.on("close", () => {
        if (!error) {
          resolve(null);
        }
      });
    });
  } catch (e) {
    console.log("upload failed:", e);
    throw e;
  }
}
