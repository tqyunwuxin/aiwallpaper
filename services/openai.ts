import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function generateImageWithReplicate(
  prompt: string,
  guidance: number = 3.5
): Promise<string[]> {
  try {
    const input = {
      prompt: prompt,
      guidance: guidance,
    };
    const output = await replicate.run("black-forest-labs/flux-dev", { input });
    if (Array.isArray(output) && output.length > 0) {
      const urls = output.map((item: any) => {
        if (typeof item === 'string') {
          return item;
        } else if (item && typeof item.url === 'function') {
          return item.url();
        }
        return null;
      }).filter(Boolean) as string[];
      return urls;
    } else {
      throw new Error("Replicate API did not return valid image URLs.");
    }
  } catch (error) {
    console.error("Error generating image with Replicate:", error);
    throw new Error(`Failed to generate image with Replicate: ${error instanceof Error ? error.message : String(error)}`);
  }
}
