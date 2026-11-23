import React, { useEffect, useRef } from 'react';

interface HeartCanvasProps {
  active?: boolean;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  fadeSpeed: number;
  scale: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
}

const COLORS = [
  'rgba(244, 63, 94, 0.75)',  // rose-500
  'rgba(236, 72, 153, 0.75)',  // pink-500
  'rgba(219, 39, 119, 0.75)',  // pink-600
  'rgba(251, 113, 133, 0.75)', // rose-400
  'rgba(190, 24, 74, 0.75)',   // rose-700
];

export const HeartCanvas: React.FC<HeartCanvasProps> = ({ active = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Function to draw a beautiful vector heart
    const drawHeart = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      size: number,
      opacity: number,
      color: string,
      rotation: number
    ) => {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.beginPath();
      
      // Heart path
      const topCurveHeight = size * 0.3;
      context.moveTo(0, topCurveHeight);
      
      // Left side curve
      context.bezierCurveTo(
        -size / 2, 
        -topCurveHeight, 
        -size, 
        topCurveHeight, 
        0, 
        size
      );
      
      // Right side curve
      context.bezierCurveTo(
        size, 
        topCurveHeight, 
        size / 2, 
        -topCurveHeight, 
        0, 
        topCurveHeight
      );

      context.closePath();
      context.fillStyle = color.replace('0.75', opacity.toFixed(2));
      
      // Add subtle glow
      context.shadowBlur = 10;
      context.shadowColor = 'rgba(244, 63, 94, 0.5)';
      
      context.fill();
      context.restore();
    };

    const createParticle = (x: number, y: number, isBurst = false): Particle => {
      const size = Math.random() * 15 + (isBurst ? 10 : 8);
      return {
        x,
        y,
        size,
        speedX: (Math.random() - 0.5) * (isBurst ? 5 : 1.5),
        speedY: isBurst ? -(Math.random() * 4 + 2) : -(Math.random() * 1.5 + 0.5),
        opacity: Math.random() * 0.5 + 0.5,
        fadeSpeed: isBurst ? Math.random() * 0.015 + 0.008 : Math.random() * 0.005 + 0.002,
        scale: 1,
        rotation: (Math.random() - 0.5) * 0.4,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
    };

    // Spawn regular floating hearts slowly
    let spawnTimer = 0;
    const animate = () => {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (active) {
        spawnTimer++;
        if (spawnTimer % 20 === 0 && particlesRef.current.length < 60) {
          particlesRef.current.push(
            createParticle(Math.random() * canvas.width, canvas.height + 20)
          );
        }
      }

      particlesRef.current.forEach((p, index) => {
        p.x += p.speedX + Math.sin(p.y / 30) * 0.2; // Subtle waving
        p.y += p.speedY;
        p.opacity -= p.fadeSpeed;
        p.rotation += p.rotationSpeed;

        if (p.opacity <= 0 || p.y < -50 || p.x < -50 || p.x > canvas.width + 50) {
          particlesRef.current.splice(index, 1);
        } else {
          drawHeart(ctx, p.x, p.y, p.size, p.opacity, p.color, p.rotation);
        }
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleWindowClick = (e: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Burst of 12 hearts on click
      for (let i = 0; i < 12; i++) {
        particlesRef.current.push(createParticle(clickX, clickY, true));
      }
    };

    window.addEventListener('click', handleWindowClick);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('click', handleWindowClick);
    };
  }, [active]);

  return (
    <canvas
      id="heart-particles-canvas"
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      style={{ mixBlendMode: 'screen' }}
    />
  );
};
