import { respData, respErr } from "@/lib/resp";
import { User } from "@/types/user";
import { currentUser } from "@clerk/nextjs";
import { downloadAndUploadImage } from "@/lib/s3";
import { getUserCredits } from "@/services/order";
import { saveUser } from "@/services/user";
import { autoRemoveBackgroundPeopleWithRetry } from "@/services/auto-person-removal";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
    return respErr("no auth");
  }

  try {
    // 检查用户积分
    const user_email = user.emailAddresses[0].emailAddress;
    const user_credits = await getUserCredits(user_email);
    
    if (!user_credits || user_credits.left_credits < 1) {
      return respErr("credits not enough");
    }

    // 保存用户信息
    const nickname = user.firstName;
    const avatarUrl = user.imageUrl;
    const userInfo: User = {
      email: user_email,
      nickname: nickname || "",
      avatar_url: avatarUrl,
    };
    await saveUser(userInfo);

    // 解析FormData
    const formData = await req.formData();
    const imageFile = formData.get('image') as File;
    
    if (!imageFile) {
      return respErr("no image file provided");
    }

    // 验证文件类型
    if (!imageFile.type.startsWith('image/')) {
      return respErr("invalid file type, only images are allowed");
    }

    // 验证文件大小 (限制为10MB)
    if (imageFile.size > 10 * 1024 * 1024) {
      return respErr("file too large, maximum size is 10MB");
    }

    console.log(`Processing image: ${imageFile.name}, size: ${imageFile.size} bytes`);

    // 上传图像到S3/Cloudflare R2
    const timestamp = Date.now();
    const fileName = `person-removal/${timestamp}_${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    const s3Result = await downloadAndUploadImage(
      imageFile, // 直接传递File对象
      process.env.CLOUDFLARE_BUCKET || "aiwallpaper-r2",
      fileName
    );

    if (!s3Result || !s3Result.Location) {
      return respErr("failed to upload image");
    }

    const imageUrl = s3Result.Location;
    console.log(`Image uploaded to: ${imageUrl}`);

    // 执行人物移除
    console.log("Starting automatic person removal...");
    
    const result = await autoRemoveBackgroundPeopleWithRetry(imageUrl, {
      targetForegroundCount: 1,
      fallbackToYOLO: true,
      maxRetries: 2
    });

    if (!result.success) {
      console.error("Person removal failed:", result.error);
      return respErr(result.error || "person removal failed");
    }

    console.log("Person removal completed successfully");
    console.log("Processing details:", result.details);

    // 如果处理成功，扣除积分
    // 注意：这里应该在实际的积分扣除逻辑中实现
    // 暂时返回成功结果

    return respData({
      result_url: result.resultUrl,
      processing_time: result.processingTime,
      details: result.details,
      message: "Background people removed successfully"
    });

  } catch (error) {
    console.error("Error in remove background persons API:", error);
    
    if (error instanceof Error) {
      return respErr(error.message);
    }
    
    return respErr("internal server error");
  }
}
