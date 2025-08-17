"use client";

import { useContext, useState, useEffect } from "react";
import { AppContext } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface ProcessingStatus {
  stage: 'idle' | 'uploading' | 'detecting' | 'removing' | 'completed' | 'error';
  message: string;
  progress: number;
}

export default function RemovePeoplePage() {
  const { user } = useContext(AppContext);
  const router = useRouter();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    message: 'Ready to process',
    progress: 0
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      
      // 验证文件大小 (限制为10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }

      setSelectedFile(file);
      
      // 创建预览 - 使用Blob URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setResultUrl(null);
      setStatus({
        stage: 'idle',
        message: 'File selected, ready to process',
        progress: 0
      });
    }
  };

  const handleProcess = async () => {
    if (!selectedFile) {
      toast.error('Please select an image first');
      return;
    }

    if (!user) {
      toast.error('Please sign in to use this feature');
      router.push('/sign-in');
      return;
    }

    if (user.credits && user.credits.left_credits < 1) {
      toast.error('Not enough credits');
      return;
    }

    try {
      setStatus({
        stage: 'uploading',
        message: 'Preparing image for processing...',
        progress: 10
      });

      // 将File转换为base64数据
      const imageData = await convertFileToBase64(selectedFile);
      
      setStatus({
        stage: 'detecting',
        message: 'Detecting people in image...',
        progress: 30
      });

      // 发送base64数据到API，不再上传文件
      const response = await fetch('/api/protected/remove-background-persons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_data: imageData,
          file_name: selectedFile.name,
          file_size: selectedFile.size
        }),
      });

      if (response.status === 401) {
        toast.error('Please sign in');
        router.push('/sign-in');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process image');
      }

      setStatus({
        stage: 'removing',
        message: 'Removing background people...',
        progress: 70
      });

      const result = await response.json();
      
      if (result.code === 0 && result.data?.result_url) {
        setResultUrl(result.data.result_url);
        setStatus({
          stage: 'completed',
          message: 'Processing completed successfully!',
          progress: 100
        });
        toast.success('Background people removed successfully!');
      } else {
        throw new Error(result.message || 'Processing failed');
      }

    } catch (error) {
      console.error('Processing error:', error);
      setStatus({
        stage: 'error',
        message: error instanceof Error ? error.message : 'Processing failed',
        progress: 0
      });
      toast.error('Failed to process image');
    }
  };

  // 将File转换为base64
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsDataURL(file);
    });
  };

  const handleDownload = () => {
    if (resultUrl) {
      const link = document.createElement('a');
      link.href = resultUrl;
      link.download = `removed-people-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const resetProcess = () => {
    // 清理Blob URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    
    setSelectedFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setStatus({
      stage: 'idle',
      message: 'Ready to process',
      progress: 0
    });
  };

  // 组件卸载时清理Blob URL
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    };
  }, [previewUrl, resultUrl]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Remove Background People
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Automatically detect and remove unwanted people from your photos while keeping the main subject intact.
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          {/* File Upload Section */}
          <div className="mb-8">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={status.stage === 'uploading' || status.stage === 'detecting' || status.stage === 'removing'}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer block"
              >
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-lg font-medium text-gray-900 mb-2">
                  {selectedFile ? selectedFile.name : 'Click to upload image'}
                </div>
                <p className="text-sm text-gray-500">
                  PNG, JPG, JPEG up to 10MB
                </p>
              </label>
            </div>
          </div>

          {/* Preview Section */}
          {previewUrl && (
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Original Image</h3>
              <div className="flex justify-center">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-96 rounded-lg shadow-md"
                />
              </div>
            </div>
          )}

          {/* Processing Status */}
          {status.stage !== 'idle' && (
            <div className="mb-8">
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {status.message}
                  </span>
                  <span className="text-sm text-gray-500">
                    {status.progress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${status.progress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {!resultUrl ? (
              <Button
                onClick={handleProcess}
                disabled={!selectedFile || status.stage === 'uploading' || status.stage === 'detecting' || status.stage === 'removing'}
                className="px-8 py-3"
              >
                {status.stage === 'uploading' || status.stage === 'detecting' || status.stage === 'removing' 
                  ? 'Processing...' 
                  : 'Remove Background People'
                }
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleDownload}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700"
                >
                  Download Result
                </Button>
                <Button
                  onClick={resetProcess}
                  variant="outline"
                  className="px-8 py-3"
                >
                  Process Another Image
                </Button>
              </>
            )}
          </div>

          {/* Result Section */}
          {resultUrl && (
            <div className="mt-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Result</h3>
              <div className="flex justify-center">
                <img
                  src={resultUrl}
                  alt="Result"
                  className="max-w-full max-h-96 rounded-lg shadow-md"
                />
              </div>
            </div>
          )}

          {/* Error Display */}
          {status.stage === 'error' && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">
                {status.message}
              </p>
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Fast Processing</h3>
            <p className="text-gray-600">AI-powered detection and removal in seconds</p>
          </div>
          
          <div className="text-center">
            <div className="bg-green-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Smart Detection</h3>
            <p className="text-gray-600">Automatically identifies and preserves main subjects</p>
          </div>
          
          <div className="text-center">
            <div className="bg-purple-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">High Quality</h3>
            <p className="text-gray-600">Professional-grade results with seamless background filling</p>
          </div>
        </div>
      </div>
    </div>
  );
}
