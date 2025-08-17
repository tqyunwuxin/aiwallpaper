import { respData, respErr } from "@/lib/resp";
import { User } from "@/types/user";
import { currentUser } from "@clerk/nextjs";
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

    // 解析JSON请求体，不再使用FormData
    const { image_data, file_name, file_size } = await req.json();
    
    if (!image_data) {
      return respErr("no image data provided");
    }

    // 验证图像数据格式
    if (!image_data.startsWith('data:image/')) {
      return respErr("invalid image data format");
    }

    // 验证文件大小 (限制为10MB)
    if (file_size && file_size > 10 * 1024 * 1024) {
      return respErr("file too large, maximum size is 10MB");
    }

    console.log(`Processing image: ${file_name || 'unknown'}, size: ${file_size || 'unknown'} bytes`);

    // 直接使用base64图像数据，不需要上传到S3/R2
    const imageUrl = image_data;
    console.log(`Image data received, length: ${image_data.length} characters`);

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
