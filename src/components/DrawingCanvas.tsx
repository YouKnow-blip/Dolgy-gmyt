import { useEffect, useRef, useState, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Stroke, DrawPoint } from '../types';

interface DrawingCanvasProps {
  strokes: Stroke[];
  onStrokesChange: (updatedStrokes: Stroke[]) => void;
  panX: number;
  panY: number;
  zoom: number;
  activeTool: 'draw' | 'erase' | 'none';
  strokeColor: string;
  strokeWidth: number;
  brushStyle: 'solid' | 'neon' | 'dashed' | 'dotted';
  draggingLinkSourceId: string | null;
}

export default function DrawingCanvas({
  strokes,
  onStrokesChange,
  panX,
  panY,
  zoom,
  activeTool,
  strokeColor,
  strokeWidth,
  brushStyle,
  draggingLinkSourceId,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<DrawPoint[]>([]);

  // Track resizing and window boundaries
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawAll();
    };

    window.addEventListener('resize', resize);
    resize();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [strokes, panX, panY, zoom]);

  // Redraw all strokes onto canvas context
  const drawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Shift coordinate system mapping to match global Workspace Zoom & Pan
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw existing synchronized strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const style = stroke.style || 'solid';
      if (style === 'dashed') {
        ctx.setLineDash([12 * (stroke.width / 4), 8 * (stroke.width / 4)]);
        ctx.shadowBlur = 0;
      } else if (style === 'dotted') {
        ctx.setLineDash([2, 8 * (stroke.width / 4)]);
        ctx.shadowBlur = 0;
      } else if (style === 'neon') {
        ctx.setLineDash([]);
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = 12;
      } else {
        ctx.setLineDash([]);
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = 3; // soft expensive glow
      }
      
      ctx.stroke();
    });

    // Draw active stroke in progress
    if (isDrawingRef.current && currentPointsRef.current.length > 1) {
      ctx.beginPath();
      ctx.moveTo(currentPointsRef.current[0].x, currentPointsRef.current[0].y);
      for (let i = 1; i < currentPointsRef.current.length; i++) {
        ctx.lineTo(currentPointsRef.current[i].x, currentPointsRef.current[i].y);
      }
      ctx.strokeStyle = activeTool === 'erase' ? 'rgba(0,0,0,0.5)' : strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (activeTool === 'erase') {
        ctx.setLineDash([4, 4]);
        ctx.shadowBlur = 0;
      } else {
        if (brushStyle === 'dashed') {
          ctx.setLineDash([12 * (strokeWidth / 4), 8 * (strokeWidth / 4)]);
          ctx.shadowBlur = 0;
        } else if (brushStyle === 'dotted') {
          ctx.setLineDash([2, 8 * (strokeWidth / 4)]);
          ctx.shadowBlur = 0;
        } else if (brushStyle === 'neon') {
          ctx.setLineDash([]);
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = 12;
        } else {
          ctx.setLineDash([]);
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = 3;
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  };

  // Redraw if layout parameters change
  useEffect(() => {
    drawAll();
  }, [strokes, panX, panY, zoom, brushStyle, strokeColor, strokeWidth, activeTool]);

  // Translate client coordinates directly to Board-relative Coordinates
  const getBoardCoords = (clientX: number, clientY: number): DrawPoint => {
    return {
      x: (clientX - panX) / zoom,
      y: (clientY - panY) / zoom,
    };
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'none' || e.button !== 0) return; // Only draw on primary click and appropriate tool
    isDrawingRef.current = true;
    
    const boardPoint = getBoardCoords(e.clientX, e.clientY);
    currentPointsRef.current = [boardPoint];
    drawAll();
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || activeTool === 'none') return;

    const boardPoint = getBoardCoords(e.clientX, e.clientY);
    
    // Erase mode intersection check
    if (activeTool === 'erase') {
      // Find and delete any strokes colliding with this eraser circle boundary
      const eraseRadius = 24 / zoom;
      const filteredStrokes = strokes.filter(s => {
        // True if any point of this stroke is in safety range of eraser
        return !s.points.some(p => {
          const dx = p.x - boardPoint.x;
          const dy = p.y - boardPoint.y;
          return Math.sqrt(dx * dx + dy * dy) < eraseRadius;
        });
      });

      if (filteredStrokes.length !== strokes.length) {
        onStrokesChange(filteredStrokes);
      }
    } else {
      // Draw mode stroke accumulation
      currentPointsRef.current.push(boardPoint);
      drawAll();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (activeTool === 'draw' && currentPointsRef.current.length > 1) {
      const newStroke: Stroke = {
        points: [...currentPointsRef.current],
        color: strokeColor,
        width: strokeWidth,
        style: brushStyle,
      };
      
      onStrokesChange([...strokes, newStroke]);
    }
    
    currentPointsRef.current = [];
    drawAll();
  };

  const cursorStyle = () => {
    if (activeTool === 'draw') return 'crosshair';
    if (activeTool === 'erase') return 'cell';
    return 'default';
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="absolute inset-0 block select-none"
      style={{
        cursor: cursorStyle(),
        pointerEvents: (activeTool !== 'none' && !draggingLinkSourceId) ? 'auto' : 'none',
        zIndex: 5, // Drawings directly behind task sheets but interactable on canvas selection modes
      }}
    />
  );
}
