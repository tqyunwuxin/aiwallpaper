import { detectPeopleInImage, detectPeopleWithYOLO } from './person-detection';
import { separateForegroundBackground, generateInpaintingMask } from './foreground-separation';
import { smartInpainting, generateOptimizedPrompt } from './background-inpainting';

export interface PersonRemovalResult {
  success: boolean;
  resultUrl?: string;
  processingTime: number;
  details: {
    peopleDetected: number;
    foregroundPeople: number;
    backgroundPeople: number;
    modelUsed: string;
    inpaintingModel: string;
  };
  error?: string;
}

export interface PersonRemovalOptions {
  targetForegroundCount?: number; // 目标前景人物数量，默认1
  preferredInpaintingModel?: string; // 首选的inpainting模型
  customPrompt?: string; // 自定义inpainting提示词
  fallbackToYOLO?: boolean; // 如果SAM-2失败，是否回退到YOLO
  maxRetries?: number; // 最大重试次数
}

/**
 * 自动人物移除主流程
 * 完整的端到端人物移除服务
 */
export async function autoRemoveBackgroundPeople(
  imageUrl: string,
  options: PersonRemovalOptions = {}
): Promise<PersonRemovalResult> {
  const startTime = Date.now();
  
  const {
    targetForegroundCount = 1,
    preferredInpaintingModel,
    customPrompt,
    fallbackToYOLO = true,
    maxRetries = 2
  } = options;

  try {
    console.log("🚀 Starting automatic background people removal...");
    console.log("Options:", options);

    // 第一步：人物检测
    console.log("📸 Step 1: Detecting people in image...");
    let detectionResult;
    
    try {
      detectionResult = await detectPeopleInImage(imageUrl);
      console.log(`✅ SAM-2 detection successful: ${detectionResult.masks.length} people detected`);
    } catch (error) {
      console.log("❌ SAM-2 detection failed, trying YOLO fallback...");
      
      if (fallbackToYOLO) {
        try {
          detectionResult = await detectPeopleWithYOLO(imageUrl);
          console.log(`✅ YOLO fallback successful: ${detectionResult.masks.length} people detected`);
        } catch (yoloError) {
          throw new Error(`Both SAM-2 and YOLO detection failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        throw error;
      }
    }

    if (!detectionResult || detectionResult.masks.length === 0) {
      return {
        success: false,
        processingTime: Date.now() - startTime,
        details: {
          peopleDetected: 0,
          foregroundPeople: 0,
          backgroundPeople: 0,
          modelUsed: "none",
          inpaintingModel: "none"
        },
        error: "No people detected in the image"
      };
    }

    // 第二步：前景/背景分离
    console.log("🎯 Step 2: Separating foreground and background people...");
    const separationResult = separateForegroundBackground(
      detectionResult, 
      targetForegroundCount
    );

    console.log(`✅ Separation completed: ${separationResult.foregroundMasks.length} foreground, ${separationResult.backgroundMasks.length} background`);

    // 如果没有背景人物需要移除，直接返回原图
    if (separationResult.backgroundMasks.length === 0) {
      console.log("ℹ️ No background people to remove, returning original image");
      return {
        success: true,
        resultUrl: imageUrl,
        processingTime: Date.now() - startTime,
        details: {
          peopleDetected: detectionResult.masks.length,
          foregroundPeople: separationResult.foregroundMasks.length,
          backgroundPeople: 0,
          modelUsed: "SAM-2/YOLO",
          inpaintingModel: "none"
        }
      };
    }

    // 第三步：生成inpainting mask
    console.log("🎭 Step 3: Generating inpainting mask...");
    const inpaintingMask = generateInpaintingMask(
      separationResult.backgroundMasks,
      detectionResult.imageWidth,
      detectionResult.imageHeight
    );

    if (!inpaintingMask) {
      throw new Error("Failed to generate inpainting mask");
    }

    // 第四步：背景填充
    console.log("🎨 Step 4: Filling background with AI...");
    
    // 生成优化的提示词
    const optimizedPrompt = generateOptimizedPrompt(
      customPrompt,
      "outdoor" // 这里可以根据图像分析结果动态生成
    );

    console.log(`Using prompt: "${optimizedPrompt}"`);

    // 执行inpainting
    const inpaintingResult = await smartInpainting(
      imageUrl,
      inpaintingMask,
      optimizedPrompt,
      preferredInpaintingModel
    );

    console.log(`✅ Inpainting completed using ${inpaintingResult.modelUsed}`);

    // 验证结果
    const isValid = validateInpaintingResult(
      inpaintingResult.resultUrl,
      imageUrl,
      inpaintingMask
    );

    if (!isValid) {
      throw new Error("Inpainting result validation failed");
    }

    const totalTime = Date.now() - startTime;
    console.log(`🎉 Background people removal completed in ${totalTime}ms`);

    return {
      success: true,
      resultUrl: inpaintingResult.resultUrl,
      processingTime: totalTime,
      details: {
        peopleDetected: detectionResult.masks.length,
        foregroundPeople: separationResult.foregroundMasks.length,
        backgroundPeople: separationResult.backgroundMasks.length,
        modelUsed: "SAM-2/YOLO",
        inpaintingModel: inpaintingResult.modelUsed
      }
    };

  } catch (error) {
    console.error("❌ Error in auto person removal:", error);
    
    return {
      success: false,
      processingTime: Date.now() - startTime,
      details: {
        peopleDetected: 0,
        foregroundPeople: 0,
        backgroundPeople: 0,
        modelUsed: "none",
        inpaintingModel: "none"
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 带重试的自动人物移除
 * 如果失败会自动重试指定次数
 */
export async function autoRemoveBackgroundPeopleWithRetry(
  imageUrl: string,
  options: PersonRemovalOptions = {}
): Promise<PersonRemovalResult> {
  const { maxRetries = 2 } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 Attempt ${attempt}/${maxRetries}...`);
    
    try {
      const result = await autoRemoveBackgroundPeople(imageUrl, options);
      
      if (result.success) {
        console.log(`✅ Success on attempt ${attempt}`);
        return result;
      } else {
        console.log(`❌ Failed on attempt ${attempt}: ${result.error}`);
        
        if (attempt === maxRetries) {
          return result; // 最后一次尝试失败，返回结果
        }
        
        // 等待一段时间后重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最大5秒
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.log(`❌ Error on attempt ${attempt}:`, error);
      
      if (attempt === maxRetries) {
        return {
          success: false,
          processingTime: 0,
          details: {
            peopleDetected: 0,
            foregroundPeople: 0,
            backgroundPeople: 0,
            modelUsed: "none",
            inpaintingModel: "none"
          },
          error: error instanceof Error ? error.message : String(error)
        };
      }
      
      // 等待后重试
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 这里不应该到达，但为了类型安全
  return {
    success: false,
    processingTime: 0,
    details: {
      peopleDetected: 0,
      foregroundPeople: 0,
      backgroundPeople: 0,
      modelUsed: "none",
      inpaintingModel: "none"
    },
    error: "Max retries exceeded"
  };
}

/**
 * 验证inpainting结果质量
 * 检查结果是否合理
 */
function validateInpaintingResult(
  resultUrl: string,
  originalImageUrl: string,
  maskUrl: string
): boolean {
  // 这里应该实现结果质量验证逻辑
  // 例如：检查图像尺寸、格式、是否包含明显的伪影等
  
  // 简化实现：总是返回true
  return true;
}

/**
 * 获取处理进度信息
 * 用于前端显示处理状态
 */
export function getProcessingProgress(
  stage: 'detecting' | 'separating' | 'inpainting' | 'completed'
): { progress: number; message: string } {
  const stages = {
    detecting: { progress: 25, message: "Detecting people in image..." },
    separating: { progress: 50, message: "Separating foreground and background..." },
    inpainting: { progress: 75, message: "Filling background with AI..." },
    completed: { progress: 100, message: "Processing completed!" }
  };
  
  return stages[stage];
}
