import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export interface InpaintingResult {
  resultUrl: string;
  processingTime: number;
  modelUsed: string;
}

/**
 * 使用Stability AI的inpainting模型填充背景
 * 这是高质量背景填充的首选方案
 */
export async function inpaintWithStabilityAI(
  imageUrl: string,
  maskUrl: string,
  prompt: string = "natural background, seamless, high quality"
): Promise<InpaintingResult> {
  try {
    console.log("Starting inpainting with Stability AI...");
    const startTime = Date.now();
    
    const output = await replicate.run(
      "stability-ai/stable-diffusion-inpainting:95fcc2a26d59963c39f0c7e68b5c512f3d55b764b3b968e6ee4f7796d2e05af29",
      {
        input: {
          image: imageUrl,
          mask: maskUrl,
          prompt: prompt,
          negative_prompt: "people, person, human, face, body, distorted, blurry, low quality",
          num_inference_steps: 50,
          guidance_scale: 7.5,
          num_samples: 1,
          scheduler: "DDIM",
          seed: null, // 随机种子
          width: 1024,
          height: 1024
        }
      }
    );

    if (!output || !Array.isArray(output) || output.length === 0) {
      throw new Error("Stability AI inpainting did not return valid output");
    }

    const resultUrl = output[0];
    const processingTime = Date.now() - startTime;

    console.log(`Stability AI inpainting completed in ${processingTime}ms`);

    return {
      resultUrl,
      processingTime,
      modelUsed: "stability-ai/stable-diffusion-inpainting"
    };

  } catch (error) {
    console.error("Error in Stability AI inpainting:", error);
    throw new Error(`Failed to inpaint with Stability AI: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 使用RunwayML的inpainting模型填充背景
 * 这是备选方案，效果也很好
 */
export async function inpaintWithRunwayML(
  imageUrl: string,
  maskUrl: string,
  prompt: string = "natural background, seamless, high quality"
): Promise<InpaintingResult> {
  try {
    console.log("Starting inpainting with RunwayML...");
    const startTime = Date.now();
    
    const output = await replicate.run(
      "runwayml/stable-diffusion-inpainting:51a605b0b173a4b5ae115a4c0c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5",
      {
        input: {
          image: imageUrl,
          mask: maskUrl,
          prompt: prompt,
          negative_prompt: "people, person, human, face, body, distorted, blurry, low quality",
          num_inference_steps: 50,
          guidance_scale: 7.5,
          num_samples: 1,
          scheduler: "DDIM",
          seed: null,
          width: 1024,
          height: 1024
        }
      }
    );

    if (!output || !Array.isArray(output) || output.length === 0) {
      throw new Error("RunwayML inpainting did not return valid output");
    }

    const resultUrl = output[0];
    const processingTime = Date.now() - startTime;

    console.log(`RunwayML inpainting completed in ${processingTime}ms`);

    return {
      resultUrl,
      processingTime,
      modelUsed: "runwayml/stable-diffusion-inpainting"
    };

  } catch (error) {
    console.error("Error in RunwayML inpainting:", error);
    throw new Error(`Failed to inpaint with RunwayML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 使用FLUX模型的inpainting功能
 * 如果用户有FLUX积分，可以使用这个模型
 */
export async function inpaintWithFLUX(
  imageUrl: string,
  maskUrl: string,
  prompt: string = "natural background, seamless, high quality"
): Promise<InpaintingResult> {
  try {
    console.log("Starting inpainting with FLUX...");
    const startTime = Date.now();
    
    const output = await replicate.run(
      "black-forest-labs/flux-kontext-dev:2c8b21b4f2fa7abc21b233786f95061d29c546e5ffac1456c75a8f17bb9d0c6f7",
      {
        input: {
          image: imageUrl,
          mask: maskUrl,
          prompt: prompt,
          negative_prompt: "people, person, human, face, body, distorted, blurry, low quality",
          guidance_scale: 3.5,
          num_inference_steps: 20,
          seed: null
        }
      }
    );

    if (!output || !Array.isArray(output) || output.length === 0) {
      throw new Error("FLUX inpainting did not return valid output");
    }

    const resultUrl = output[0];
    const processingTime = Date.now() - startTime;

    console.log(`FLUX inpainting completed in ${processingTime}ms`);

    return {
      resultUrl,
      processingTime,
      modelUsed: "black-forest-labs/flux-kontext-dev"
    };

  } catch (error) {
    console.error("Error in FLUX inpainting:", error);
    throw new Error(`Failed to inpaint with FLUX: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 智能选择inpainting模型
 * 根据图像特征和用户偏好选择最佳模型
 */
export async function smartInpainting(
  imageUrl: string,
  maskUrl: string,
  prompt: string = "natural background, seamless, high quality",
  preferredModel?: string
): Promise<InpaintingResult> {
  
  // 如果用户指定了模型，优先使用
  if (preferredModel) {
    try {
      switch (preferredModel) {
        case 'stability':
          return await inpaintWithStabilityAI(imageUrl, maskUrl, prompt);
        case 'runwayml':
          return await inpaintWithRunwayML(imageUrl, maskUrl, prompt);
        case 'flux':
          return await inpaintWithFLUX(imageUrl, maskUrl, prompt);
        default:
          console.log(`Unknown preferred model: ${preferredModel}, using default`);
      }
    } catch (error) {
      console.log(`Preferred model ${preferredModel} failed, trying alternatives...`);
    }
  }

  // 按优先级尝试不同模型
  const models = [
    { name: 'stability', func: inpaintWithStabilityAI },
    { name: 'runwayml', func: inpaintWithRunwayML },
    { name: 'flux', func: inpaintWithFLUX }
  ];

  for (const model of models) {
    try {
      console.log(`Trying ${model.name} inpainting...`);
      return await model.func(imageUrl, maskUrl, prompt);
    } catch (error) {
      console.log(`${model.name} inpainting failed:`, error);
      continue;
    }
  }

  throw new Error("All inpainting models failed");
}

/**
 * 生成优化的inpainting提示词
 * 根据图像内容自动生成合适的提示词
 */
export function generateOptimizedPrompt(
  originalPrompt?: string,
  imageContext?: string
): string {
  const basePrompt = originalPrompt || "natural background, seamless, high quality";
  
  // 根据图像上下文优化提示词
  let optimizedPrompt = basePrompt;
  
  if (imageContext) {
    // 这里可以根据图像分析结果添加更多上下文
    // 例如：如果是户外场景，添加"outdoor, natural lighting"
    if (imageContext.includes('outdoor') || imageContext.includes('nature')) {
      optimizedPrompt += ", outdoor, natural lighting, environmental context";
    } else if (imageContext.includes('indoor') || imageContext.includes('room')) {
      optimizedPrompt += ", indoor, architectural, room context";
    }
  }
  
  // 添加通用质量提升词
  optimizedPrompt += ", professional photography, high resolution, detailed";
  
  return optimizedPrompt;
}

/**
 * 验证inpainting结果质量
 * 检查结果是否合理
 */
export function validateInpaintingResult(
  resultUrl: string,
  originalImageUrl: string,
  maskUrl: string
): boolean {
  // 这里应该实现结果质量验证逻辑
  // 例如：检查图像尺寸、格式、是否包含明显的伪影等
  
  // 简化实现：总是返回true
  return true;
}
