import { respData, respErr } from "@/lib/resp";

import { User } from "@/types/user";
import { Wallpaper } from "@/types/wallpaper";
import { currentUser } from "@clerk/nextjs";
import { downloadAndUploadImage } from "@/lib/s3";
import { generateImageWithReplicate } from "@/services/openai";
import { getUserCredits } from "@/services/order";
import { insertWallpaper } from "@/models/wallpaper";
import { saveUser } from "@/services/user";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
    return respErr("no auth");
  }

  try {
    const { description } = await req.json();
    if (!description) {
      return respErr("invalid params");
    }

    // save user
    const user_email = user.emailAddresses[0].emailAddress;
    const nickname = user.firstName;
    const avatarUrl = user.imageUrl;
    const userInfo: User = {
      email: user_email,
      nickname: nickname || "",
      avatar_url: avatarUrl,
    };

    await saveUser(userInfo);

    const user_credits = await getUserCredits(user_email);
    if (!user_credits || user_credits.left_credits < 1) {
      return respErr("credits not enough");
    }

    const llm_name = "flux-dev";
    const img_size = "1792x1024";
    
    // 使用Replicate生成图片
    const imageUrls = await generateImageWithReplicate(
      `generate desktop wallpaper image about ${description}`,
      3.5
    );

    if (!imageUrls || imageUrls.length === 0) {
      return respErr("generate wallpaper failed");
    }

    const raw_img_url = imageUrls[0];
    const created_at = new Date().toISOString();

        // 生成安全的文件名，移除特殊字符和空格
    const img_name = description.replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
    const timestamp = Date.now();
    const s3_img = await downloadAndUploadImage(
      raw_img_url,
      process.env.CLOUDFLARE_BUCKET || "aiwallpaper-r2",
      `wallpapers/${timestamp}_${img_name}.png`
    );
    const img_url = s3_img.Location;

    const wallpaper: Wallpaper = {
      user_email: user_email,
      img_description: description,
      img_size: img_size,
      img_url: img_url,
      llm_name: llm_name,
      llm_params: JSON.stringify({ prompt: description, guidance: 3.5 }),
      created_at: created_at,
    };
    await insertWallpaper(wallpaper);

    return respData(wallpaper);
  } catch (e) {
    console.log("generate wallpaper failed: ", e);
    return respErr("generate wallpaper failed");
  }
}
