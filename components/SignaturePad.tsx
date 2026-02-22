
import React, { useRef, useEffect, useState } from 'react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  name: string;
  sessionTitles?: string[];
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onCancel, name, sessionTitles = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Use ResizeObserver to handle all layout changes (orientation, keyboard, address bar)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
    });

    resizeObserver.observe(container);

    return () => {
        resizeObserver.disconnect();
    };
  }, [hasDrawn]); // Dependency to ensure savedContent logic works if hasDrawn changes

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (canvas && container) {
        // Get the visual size (CSS pixels)
        const width = container.clientWidth;
        const height = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        
        if (width === 0 || height === 0) return;

        // Calculate target bitmap size
        const targetWidth = Math.floor(width * dpr);
        const targetHeight = Math.floor(height * dpr);

        const currentWidth = canvas.width;
        const currentHeight = canvas.height;

        // Avoid resizing if change is negligible
        if (Math.abs(currentWidth - targetWidth) < 10 && Math.abs(currentHeight - targetHeight) < 10) {
             return;
        }

        let savedContent: string | null = null;
        if (hasDrawn) {
            savedContent = canvas.toDataURL();
        }

        // Update Bitmap Size
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if(ctx) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5 * dpr; 
            
            if (savedContent) {
                const img = new Image();
                img.onload = () => {
                     ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                };
                img.src = savedContent;
            } else {
                drawPlaceholder(ctx, targetWidth, targetHeight);
            }
        }
    }
  };

  const drawPlaceholder = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.fillStyle = '#9CA3AF'; // gray-400
      ctx.font = `bold ${16 * (window.devicePixelRatio || 1)}px "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('칸에 맞추어 서명을 크게, 정자로 써주세요.', width / 2, height / 2);
      
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5 * (window.devicePixelRatio || 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
  };

  const getCoords = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;

    if ('touches' in e && (e as TouchEvent).touches.length > 0) {
      clientX = (e as TouchEvent).touches[0].clientX;
      clientY = (e as TouchEvent).touches[0].clientY;
    } else if ('changedTouches' in e && (e as TouchEvent).changedTouches.length > 0) {
      clientX = (e as TouchEvent).changedTouches[0].clientX;
      clientY = (e as TouchEvent).changedTouches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if(e.cancelable && e.type === 'touchstart') e.preventDefault();
    
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    if (!hasDrawn) {
        const canvas = canvasRef.current;
        if (canvas) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    if(e.cancelable) e.preventDefault(); 
    
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      setHasDrawn(false);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawPlaceholder(ctx, canvas.width, canvas.height);
    }
  };

  const trimCanvas = (canvas: HTMLCanvasElement): string | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = canvas.width;
    const height = canvas.height;
    
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) return null;

    const padding = 20 * (window.devicePixelRatio || 1);
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropMaxX = Math.min(width, maxX + padding);
    const cropMaxY = Math.min(height, maxY + padding);
    
    const w = cropMaxX - cropX;
    const h = cropMaxY - cropY;

    if (w <= 0 || h <= 0) return null;

    const cut = document.createElement('canvas');
    cut.width = w;
    cut.height = h;
    const cutCtx = cut.getContext('2d');
    
    if (!cutCtx) return null;

    cutCtx.drawImage(canvas, cropX, cropY, w, h, 0, 0, w, h);

    return cut.toDataURL("image/png");
  };

  const handleSave = () => {
    if (!hasDrawn) {
      alert("서명을 먼저 해주세요.");
      return;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const trimmedDataUrl = trimCanvas(canvas);
      if (trimmedDataUrl) {
          onSave(trimmedDataUrl);
      } else {
          onSave(canvas.toDataURL("image/png"));
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-auto max-h-[85vh] animate-pop-in">
        
        <div className="bg-gray-100 p-4 border-b border-gray-200 text-center flex-none relative z-10">
            {sessionTitles.length > 0 && (
                <div className="mb-2">
                     {sessionTitles.length === 1 ? (
                         <div className="text-xs text-gray-500 font-bold mb-1">서명 대상 연수</div>
                     ) : (
                         <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full inline-block mb-1 font-bold">
                             동일 날짜 연수 {sessionTitles.length}건에 일괄 서명됩니다
                         </div>
                     )}
                     <div className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight">
                         {sessionTitles.join(', ')}
                     </div>
                </div>
            )}
            
            <h3 className="text-xl font-bold text-gray-800">
                <span className="text-blue-600">{name}</span>님 서명
            </h3>
            <p className="text-sm text-red-600 font-bold mt-1 animate-pulse">
                칸에 맞추어 서명을 크게, 정자로 써주세요.
            </p>
        </div>

        <div className="p-6 bg-gray-50 flex-1 flex flex-col min-h-[200px] relative">
          <div 
             ref={containerRef} 
             className="flex-1 w-full bg-white rounded-xl shadow-sm border-2 border-dashed border-gray-400 relative touch-none mb-2 overflow-hidden"
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full block cursor-crosshair touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
        </div>

        <div className="p-4 bg-white border-t border-gray-200 flex gap-3 flex-none relative z-10">
          <button 
            onClick={clear}
            className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-xl font-bold hover:bg-gray-200 transition-all active:scale-95 active:bg-gray-300"
          >
            다시 쓰기
          </button>
          <button 
            onClick={onCancel}
            className="flex-1 py-3 text-gray-600 border border-gray-300 rounded-xl font-bold hover:bg-gray-50 transition-all active:scale-95"
          >
            취소
          </button>
          <button 
            onClick={handleSave}
            className="flex-[2] py-3 text-white bg-blue-600 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-90 active:bg-blue-800"
          >
            서명 완료
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;
