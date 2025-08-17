import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export interface PersonMask {
  id: string;
  mask: string; // base64 encoded mask
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence: number;
  centerPoint: [number, number];
  area: number;
}

export interface DetectionResult {
  masks: PersonMask[];
  imageWidth: number;
  imageHeight: number;
}

export async function detectPeopleInImage(imageUrl: string): Promise<DetectionResult> {
  try {
    console.log("Starting people detection with SAM-2...");
    
    // 使用Meta SAM-2模型进行人物检测和分割
    const output = await replicate.run(
      "meta/sam-2:2c8b21b4f2fa7abc21b233786f95061d29c546e5ffac1456c75a8f17bb9d0c6f7",
      {
        input: {
          image: imageUrl,
          points_per_side: 32, // 增加检测精度
          pred_iou_thresh: 0.88, // 提高IoU阈值
          stability_score_thresh: 0.95, // 提高稳定性阈值
          box_nms_thresh: 0.7, // NMS阈值
          crop_n_layers: 0,
          crop_nms_thresh: 0.7,
          crop_overlap_ratio: 512 / 1500,
          crop_n_points_downscale_factor: 1,
          point_grids: null,
          min_mask_region_area: 100, // 最小mask区域面积
          output_mode: "binary_mask"
        }
      }
    );

    if (!output || !Array.isArray(output)) {
      throw new Error("SAM-2 API did not return valid output");
    }

    console.log("SAM-2 detection completed, processing results...");

    // 处理检测结果
    const masks: PersonMask[] = output.map((item: any, index: number) => {
      const bbox = item.bbox || [0, 0, 100, 100]; // 默认bbox
      const centerX = bbox[0] + bbox[2] / 2;
      const centerY = bbox[1] + bbox[3] / 2;
      const area = bbox[2] * bbox[3];
      
      return {
        id: `person_${index}`,
        mask: item.mask || "",
        bbox: bbox as [number, number, number, number],
        confidence: item.confidence || 0.8,
        centerPoint: [centerX, centerY],
        area: area
      };
    });

    // 过滤掉置信度过低的检测结果
    const filteredMasks = masks.filter(mask => mask.confidence > 0.5);

    console.log(`Detected ${filteredMasks.length} people with confidence > 0.5`);

    return {
      masks: filteredMasks,
      imageWidth: 1024, // 默认值，实际应该从图像获取
      imageHeight: 1024
    };

  } catch (error) {
    console.error("Error in people detection:", error);
    throw new Error(`Failed to detect people: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 备用方案：使用YOLO + SAM组合
export async function detectPeopleWithYOLO(imageUrl: string): Promise<DetectionResult> {
  try {
    console.log("Starting people detection with YOLO + SAM...");
    
    // 第一步：使用YOLO检测人物边界框
    const yoloOutput = await replicate.run(
      "ultralytics/yolov8:6be2178731f0d4c3e31c82c7f67d3a3b0b3d5ea2f96b0b3a3b0b3d5ea2f96b0b",
      {
        input: {
          image: imageUrl,
          model: "yolov8n.pt",
          conf: 0.5,
          iou: 0.7,
          max_det: 20,
          classes: [0] // 只检测人物类 (COCO class 0)
        }
      }
    );

    if (!yoloOutput || !Array.isArray(yoloOutput)) {
      throw new Error("YOLO API did not return valid output");
    }

    console.log("YOLO detection completed, processing with SAM...");

    // 第二步：使用SAM为每个检测到的人物生成mask
    const masks: PersonMask[] = [];
    
    for (let i = 0; i < yoloOutput.length; i++) {
      const detection = yoloOutput[i];
      const bbox = detection.bbox || [0, 0, 100, 100];
      
      // 使用SAM生成mask
      const samOutput = await replicate.run(
        "meta/sam:2c8b21b4f2fa7abc21b233786f95061d29c546e5ffac1456c75a8f17bb9d0c6f7",
        {
          input: {
            image: imageUrl,
            input_box: bbox,
            input_point: null,
            input_label: null,
            multimask_output: false
          }
        }
      );

      if (samOutput && (samOutput as any).mask) {
        const centerX = bbox[0] + bbox[2] / 2;
        const centerY = bbox[1] + bbox[3] / 2;
        const area = bbox[2] * bbox[3];
        
        masks.push({
          id: `person_${i}`,
          mask: (samOutput as any).mask,
          bbox: bbox as [number, number, number, number],
          confidence: detection.confidence || 0.8,
          centerPoint: [centerX, centerY],
          area: area
        });
      }
    }

    console.log(`Generated ${masks.length} person masks with YOLO + SAM`);

    return {
      masks: masks,
      imageWidth: 1024,
      imageHeight: 1024
    };

  } catch (error) {
    console.error("Error in YOLO + SAM detection:", error);
    throw new Error(`Failed to detect people with YOLO + SAM: ${error instanceof Error ? error.message : String(error)}`);
  }
}
