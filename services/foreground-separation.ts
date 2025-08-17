import { PersonMask, DetectionResult } from './person-detection';

export interface ForegroundScore {
  personId: string;
  score: number;
  factors: {
    position: number;      // 位置得分 (0-100)
    size: number;          // 尺寸得分 (0-100) 
    clarity: number;       // 清晰度得分 (0-100)
    centrality: number;    // 中心度得分 (0-100)
    orientation: number;   // 朝向得分 (0-100)
  };
}

export interface SeparationResult {
  foregroundMasks: PersonMask[];
  backgroundMasks: PersonMask[];
  foregroundMask: string; // 合并后的前景mask
  backgroundMask: string; // 合并后的背景mask
}

/**
 * 计算人物的前景得分
 * 得分越高，越可能是前景人物（主要拍摄对象）
 */
export function calculateForegroundScore(
  person: PersonMask, 
  imageWidth: number, 
  imageHeight: number
): ForegroundScore {
  
  // 1. 位置得分 - 距离图像中心越近，得分越高
  const positionScore = calculatePositionScore(person, imageWidth, imageHeight);
  
  // 2. 尺寸得分 - 人物面积占比越大，得分越高（但过大可能是误检）
  const sizeScore = calculateSizeScore(person, imageWidth, imageHeight);
  
  // 3. 中心度得分 - 人物中心点距离图像中心的距离
  const centralityScore = calculateCentralityScore(person, imageWidth, imageHeight);
  
  // 4. 朝向得分 - 基于人物在图像中的位置判断
  const orientationScore = calculateOrientationScore(person, imageWidth, imageHeight);
  
  // 5. 清晰度得分 - 基于人物区域的特征（这里简化处理）
  const clarityScore = calculateClarityScore(person);
  
  // 权重分配
  const weights = {
    position: 0.30,    // 位置最重要
    size: 0.25,        // 尺寸次之
    centrality: 0.20,  // 中心度
    orientation: 0.15, // 朝向
    clarity: 0.10      // 清晰度
  };
  
  const finalScore = 
    positionScore * weights.position +
    sizeScore * weights.size +
    centralityScore * weights.centrality +
    orientationScore * weights.orientation +
    clarityScore * weights.clarity;
    
  return {
    personId: person.id,
    score: Math.max(0, Math.min(100, finalScore)), // 确保得分在0-100范围内
    factors: { 
      position: positionScore, 
      size: sizeScore, 
      clarity: clarityScore,
      centrality: centralityScore,
      orientation: orientationScore
    }
  };
}

/**
 * 位置得分计算
 * 图像中心区域的人物得分更高
 */
function calculatePositionScore(
  person: PersonMask, 
  imageWidth: number, 
  imageHeight: number
): number {
  const [x, y, w, h] = person.bbox;
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  
  // 计算到图像中心的距离
  const imageCenterX = imageWidth / 2;
  const imageCenterY = imageHeight / 2;
  
  const distance = Math.sqrt(
    Math.pow(centerX - imageCenterX, 2) + 
    Math.pow(centerY - imageCenterY, 2)
  );
  
  // 距离越近，得分越高
  const maxDistance = Math.sqrt(Math.pow(imageWidth/2, 2) + Math.pow(imageHeight/2, 2));
  const normalizedDistance = distance / maxDistance;
  
  // 使用指数衰减函数，中心区域得分更高
  return Math.max(0, 100 * Math.exp(-3 * normalizedDistance));
}

/**
 * 尺寸得分计算
 * 人物面积占比越大，得分越高（但过大可能是误检）
 */
function calculateSizeScore(
  person: PersonMask, 
  imageWidth: number, 
  imageHeight: number
): number {
  const [x, y, w, h] = person.bbox;
  const personArea = w * h;
  const imageArea = imageWidth * imageHeight;
  const areaRatio = personArea / imageArea;
  
  // 理想的人物占比范围：5% - 40%
  const minOptimalRatio = 0.05;
  const maxOptimalRatio = 0.40;
  
  if (areaRatio < minOptimalRatio) {
    // 太小的人物，得分较低
    return (areaRatio / minOptimalRatio) * 60;
  } else if (areaRatio > maxOptimalRatio) {
    // 太大的人物，可能是误检，得分递减
    const excessRatio = (areaRatio - maxOptimalRatio) / (0.8 - maxOptimalRatio);
    return Math.max(20, 100 * (1 - excessRatio));
  } else {
    // 理想范围内，得分100
    return 100;
  }
}

/**
 * 中心度得分计算
 * 人物中心点距离图像中心的距离
 */
function calculateCentralityScore(
  person: PersonMask, 
  imageWidth: number, 
  imageHeight: number
): number {
  const [centerX, centerY] = person.centerPoint;
  const imageCenterX = imageWidth / 2;
  const imageCenterY = imageHeight / 2;
  
  // 计算到图像中心的距离
  const distance = Math.sqrt(
    Math.pow(centerX - imageCenterX, 2) + 
    Math.pow(centerY - imageCenterY, 2)
  );
  
  // 距离越近，得分越高
  const maxDistance = Math.sqrt(Math.pow(imageWidth/2, 2) + Math.pow(imageHeight/2, 2));
  const normalizedDistance = distance / maxDistance;
  
  // 使用高斯函数，中心区域得分更高
  return Math.max(0, 100 * Math.exp(-2 * Math.pow(normalizedDistance, 2)));
}

/**
 * 朝向得分计算
 * 基于人物在图像中的位置判断
 */
function calculateOrientationScore(
  person: PersonMask, 
  imageWidth: number, 
  imageHeight: number
): number {
  const [x, y, w, h] = person.bbox;
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  
  // 判断人物是否在图像的前景区域
  // 通常前景人物在图像的下半部分
  const isInForegroundArea = centerY > imageHeight * 0.3;
  
  // 判断人物是否在图像的中心水平区域
  const isInCenterHorizontal = centerX > imageWidth * 0.2 && centerX < imageWidth * 0.8;
  
  let score = 50; // 基础分
  
  if (isInForegroundArea) score += 30;
  if (isInCenterHorizontal) score += 20;
  
  return Math.min(100, score);
}

/**
 * 清晰度得分计算
 * 基于人物区域的特征（简化版本）
 */
function calculateClarityScore(person: PersonMask): number {
  // 这里简化处理，实际应该分析图像质量
  // 可以根据人物面积、置信度等推断
  const baseScore = 70;
  const confidenceBonus = person.confidence * 30;
  
  return Math.min(100, baseScore + confidenceBonus);
}

/**
 * 前景/背景人物分离
 * 自动识别前景人物（主要拍摄对象）
 */
export function separateForegroundBackground(
  detectionResult: DetectionResult,
  targetForegroundCount: number = 1
): SeparationResult {
  const { masks, imageWidth, imageHeight } = detectionResult;
  
  if (masks.length === 0) {
    return {
      foregroundMasks: [],
      backgroundMasks: [],
      foregroundMask: "",
      backgroundMask: ""
    };
  }
  
  // 计算每个人物的前景得分
  const scores: ForegroundScore[] = masks.map(mask => 
    calculateForegroundScore(mask, imageWidth, imageHeight)
  );
  
  // 按得分排序，选择得分最高的作为前景人物
  scores.sort((a, b) => b.score - a.score);
  
  const foregroundCount = Math.min(targetForegroundCount, scores.length);
  const foregroundIds = scores.slice(0, foregroundCount).map(s => s.personId);
  
  // 分离前景和背景人物
  const foregroundMasks = masks.filter(mask => foregroundIds.includes(mask.id));
  const backgroundMasks = masks.filter(mask => !foregroundIds.includes(mask.id));
  
  console.log(`Separated ${foregroundMasks.length} foreground and ${backgroundMasks.length} background people`);
  console.log("Foreground scores:", scores.slice(0, foregroundCount));
  
  // 生成合并后的mask
  const foregroundMask = combineMasks(foregroundMasks);
  const backgroundMask = combineMasks(backgroundMasks);
  
  return {
    foregroundMasks,
    backgroundMasks,
    foregroundMask,
    backgroundMask
  };
}

/**
 * 合并多个mask
 * 这里简化处理，实际应该进行像素级的mask合并
 */
function combineMasks(masks: PersonMask[]): string {
  if (masks.length === 0) return "";
  
  // 简化实现：返回第一个mask
  // 实际应该进行像素级的mask合并操作
  return masks[0].mask;
}

/**
 * 生成用于inpainting的mask
 * 背景人物区域需要被填充
 */
export function generateInpaintingMask(
  backgroundMasks: PersonMask[],
  imageWidth: number,
  imageHeight: number
): string {
  if (backgroundMasks.length === 0) {
    return ""; // 没有背景人物需要移除
  }
  
  // 这里应该生成一个合并的mask，标记所有需要填充的区域
  // 简化实现：返回第一个背景人物的mask
  return backgroundMasks[0].mask;
}
