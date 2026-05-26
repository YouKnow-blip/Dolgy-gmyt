import { useEffect, useRef, useState, useCallback } from 'react';
import { Task, PhysicsNode, RopeConstraint } from '../types';

interface UsePhysicsProps {
  tasks: Task[];
  onTasksPositionUpdate: (updatedPositions: { id: string; posX: number; posY: number }[]) => void;
  panX: number;
  panY: number;
  zoom: number;
}

export function usePhysics({ tasks, onTasksPositionUpdate, panX, panY, zoom }: UsePhysicsProps) {
  const nodesRef = useRef<{ [id: string]: PhysicsNode }>({});
  const ropesRef = useRef<RopeConstraint[]>([]);
  const isDraggingIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const mousePosRef = useRef({ x: 0, y: 0 });
  const requestRef = useRef<number | null>(null);
  const localPositionsRef = useRef<{ [id: string]: { x: number; y: number } }>({});
  const [positions, setPositions] = useState<{ [id: string]: { x: number; y: number } }>({});
  const [ropes, setRopes] = useState<RopeConstraint[]>([]);
  const lastSyncTimeRef = useRef<number>(0);

  // Sync tasks to physics nodes
  useEffect(() => {
    const currentNodes = nodesRef.current;
    
    // Add new tasks or update pinned states
    tasks.forEach(task => {
      const hasMedia = task.attachedImage || task.attachedAudio || task.attachedLink;
      const computedHeight = hasMedia ? 260 : 160;

      if (!currentNodes[task.id]) {
        currentNodes[task.id] = {
          id: task.id,
          x: task.posX || (window.innerWidth / 2) + (Math.random() * 100 - 50),
          y: task.posY || (window.innerHeight / 2) + (Math.random() * 100 - 50),
          vx: 0,
          vy: 0,
          width: 300, 
          height: computedHeight,
          mass: hasMedia ? 1.4 : 1.0,
          pinned: task.pinned
        };
      } else {
        // Keeps pinned status and sizes in sync
        currentNodes[task.id].pinned = task.pinned;
        currentNodes[task.id].width = 300;
        currentNodes[task.id].height = computedHeight;
        currentNodes[task.id].mass = hasMedia ? 1.4 : 1.0;
        // If task got updated in Firebase positions, snap if it's not the one we are dragging
        if (isDraggingIdRef.current !== task.id) {
          const node = currentNodes[task.id];
          // Slow interpolation towards cloud position if they diverge too much
          const dx = task.posX - node.x;
          const dy = task.posY - node.y;
          if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
            node.x = task.posX;
            node.y = task.posY;
          }
        }
      }
    });

    // Remove deleted tasks
    const taskIds = new Set(tasks.map(t => t.id));
    let ropesNeedFilter = false;
    Object.keys(currentNodes).forEach(id => {
      if (!taskIds.has(id)) {
        delete currentNodes[id];
        ropesNeedFilter = true;
      }
    });
    if (ropesNeedFilter) {
      ropesRef.current = ropesRef.current.filter(r => taskIds.has(r.nodeAId) && taskIds.has(r.nodeBId));
    }
    setRopes([...ropesRef.current]);
  }, [tasks]);

  // Handle Dragging Events
  const startDrag = useCallback((id: string, clientX: number, clientY: number) => {
    isDraggingIdRef.current = id;
    const node = nodesRef.current[id];
    if (node) {
      // Unpinned temporarily to follow cursor easily
      node.vx = 0;
      node.vy = 0;
      
      // Calculate cursor click position relative to center of the card, taking zoom/pan into account
      const boardMouseX = (clientX - panX) / zoom;
      const boardMouseY = (clientY - panY) / zoom;
      dragOffsetRef.current = {
        x: node.x - boardMouseX,
        y: node.y - boardMouseY
      };
    }
  }, [panX, panY, zoom]);

  const updateDragMouse = useCallback((clientX: number, clientY: number) => {
    const boardMouseX = (clientX - panX) / zoom;
    const boardMouseY = (clientY - panY) / zoom;
    mousePosRef.current = { x: boardMouseX, y: boardMouseY };
  }, [panX, panY, zoom]);

  const endDrag = useCallback(() => {
    if (isDraggingIdRef.current) {
      const draggedId = isDraggingIdRef.current;
      isDraggingIdRef.current = null;
      
      // Final push sync back to cloud/state
      const node = nodesRef.current[draggedId];
      if (node) {
        onTasksPositionUpdate([{ id: draggedId, posX: node.x, posY: node.y }]);
      }
    }
  }, [onTasksPositionUpdate]);

  // Quick feature: shake board
  const shakeBoard = useCallback(() => {
    (Object.values(nodesRef.current) as PhysicsNode[]).forEach(node => {
      if (node.pinned) {
        // give pinned nodes a gorgeous jiggle vibration!
        node.x += (Math.random() - 0.5) * 12;
        node.y += (Math.random() - 0.5) * 12;
      } else {
        node.vx += (Math.random() - 0.5) * 55;
        node.vy += (Math.random() - 0.5) * 55;
      }
    });
  }, []);

  // Quick feature: trigger rope constraint between two notes
  const toggleLink = useCallback((idA: string, idB: string) => {
    const existingIndex = ropesRef.current.findIndex(r => 
      (r.nodeAId === idA && r.nodeBId === idB) || (r.nodeAId === idB && r.nodeBId === idA)
    );
    if (existingIndex > -1) {
      ropesRef.current.splice(existingIndex, 1);
    } else {
      ropesRef.current.push({
        id: `${idA}_${idB}`,
        nodeAId: idA,
        nodeBId: idB,
        restLength: 320,
        stiffness: 0.04
      });
    }
    setRopes([...ropesRef.current]);
  }, []);

  // Execution Frame Loop
  useEffect(() => {
    const loop = () => {
      const nodes = Object.values(nodesRef.current) as PhysicsNode[];
      const isDraggingId = isDraggingIdRef.current;
      const mousePos = mousePosRef.current;
      const dragOffset = dragOffsetRef.current;

      // 1. Handle drag cursor spring pull
      if (isDraggingId && nodesRef.current[isDraggingId]) {
        const activeNode = nodesRef.current[isDraggingId];
        if (!activeNode.pinned) {
          const targetX = mousePos.x + dragOffset.x;
          const targetY = mousePos.y + dragOffset.y;
          
          // Spring drag velocity pull
          activeNode.x += (targetX - activeNode.x) * 0.3;
          activeNode.y += (targetY - activeNode.y) * 0.3;
        }
        activeNode.vx = 0;
        activeNode.vy = 0;
      }

      // 2. Air resistance and simple board boundaries limits
      const borderPadding = 1000; // Large scrolling canvas boundaries
      const minX = -borderPadding;
      const maxX = borderPadding + 1000;
      const minY = -borderPadding;
      const maxY = borderPadding + 1000;

      nodes.forEach(node => {
        if (node.id === isDraggingId) return;

        // Apply friction
        node.vx *= 0.90;
        node.vy *= 0.90;

        // Apply velocities
        if (!node.pinned) {
          node.x += node.vx;
          node.y += node.vy;
        }

        // Boundary bounce collisions
        const halfW = node.width / 2;
        const halfH = node.height / 2;

        if (node.x - halfW < minX) {
          node.x = minX + halfW;
          node.vx *= -0.5;
        } else if (node.x + halfW > maxX) {
          node.x = maxX - halfW;
          node.vx *= -0.5;
        }

        if (node.y - halfH < minY) {
          node.y = minY + halfH;
          node.vy *= -0.5;
        } else if (node.y + halfH > maxY) {
          node.y = maxY - halfH;
          node.vy *= -0.5;
        }
      });

      // 3. Resolve Rope Constraints (Elastic joints linking notes together)
      ropesRef.current.forEach(rope => {
        const nodeA = nodesRef.current[rope.nodeAId];
        const nodeB = nodesRef.current[rope.nodeBId];
        if (nodeA && nodeB) {
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = dist - rope.restLength;
          const force = diff * rope.stiffness;
          const pushX = (dx / dist) * force;
          const pushY = (dy / dist) * force;

          if (!nodeA.pinned && nodeA.id !== isDraggingId) {
            nodeA.vx += pushX * 0.5;
            nodeA.vy += pushY * 0.5;
          }
          if (!nodeB.pinned && nodeB.id !== isDraggingId) {
            nodeB.vx -= pushX * 0.5;
            nodeB.vy -= pushY * 0.5;
          }
        }
      });

      // 4. Resolve AABB Circle-Rectangle inspired rigid body overlapping collisions
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const A = nodes[i];
          const B = nodes[j];

          const halfWA = A.width / 2;
          const halfHA = A.height / 2;
          const halfWB = B.width / 2;
          const halfHB = B.height / 2;

          const dx = B.x - A.x;
          const dy = B.y - A.y;

          // Compute overlapping threshold metrics
          const overlapX = (halfWA + halfWB) - Math.abs(dx);
          const overlapY = (halfHA + halfHB) - Math.abs(dy);

          if (overlapX > 0 && overlapY > 0) {
            // Overlapping detected! Resolve along axis of minimum penetration
            if (overlapX < overlapY) {
              const sign = dx > 0 ? 1 : -1;
              const moveAmount = overlapX * 0.51; // Tiny extra cushion factor to prevent sticking
              
              if (!A.pinned && A.id !== isDraggingId) {
                A.x -= moveAmount * sign;
                A.vx -= A.vx * 0.1; // damping
              }
              if (!B.pinned && B.id !== isDraggingId) {
                B.x += moveAmount * sign;
                B.vx -= B.vx * 0.1;
              }
              
              // Velocity bounce response swap
              const bounceImpact = 0.45;
              const relativeVx = B.vx - A.vx;
              if (relativeVx * sign < 0) {
                const impulse = relativeVx * bounceImpact;
                if (!A.pinned && A.id !== isDraggingId) A.vx += impulse;
                if (!B.pinned && B.id !== isDraggingId) B.vx -= impulse;
              }
            } else {
              const sign = dy > 0 ? 1 : -1;
              const moveAmount = overlapY * 0.51;

              if (!A.pinned && A.id !== isDraggingId) {
                A.y -= moveAmount * sign;
                A.vy -= A.vy * 0.1;
              }
              if (!B.pinned && B.id !== isDraggingId) {
                B.y += moveAmount * sign;
                B.vy -= B.vy * 0.1;
              }

              // Velocity bounce response swap
              const bounceImpact = 0.45;
              const relativeVy = B.vy - A.vy;
              if (relativeVy * sign < 0) {
                const impulse = relativeVy * bounceImpact;
                if (!A.pinned && A.id !== isDraggingId) A.vy += impulse;
                if (!B.pinned && B.id !== isDraggingId) B.vy -= impulse;
              }
            }
          }
        }
      }

      // 5. Update react positions state
      const nextPositions: { [id: string]: { x: number; y: number } } = {};
      nodes.forEach(node => {
        nextPositions[node.id] = { x: node.x, y: node.y };
        localPositionsRef.current[node.id] = { x: node.x, y: node.y };
      });
      setPositions(nextPositions);

      // 6. Throttled cloud synced positioning adjustments (e.g. every 2 seconds during dragging or movements)
      const now = Date.now();
      if (now - lastSyncTimeRef.current > 3000) {
        lastSyncTimeRef.current = now;
        
        // Find nodes whose coordinates are moving significantly and require standard sync
        const activeMoves = nodes
          .filter(node => {
            const task = tasks.find(t => t.id === node.id);
            if (!task) return false;
            const diffX = Math.abs(node.x - task.posX);
            const diffY = Math.abs(node.y - task.posY);
            // Move threshold check
            return (diffX > 5 || diffY > 5) && (node.id === isDraggingId || Math.abs(node.vx) > 0.1 || Math.abs(node.vy) > 0.1);
          })
          .map(node => ({ id: node.id, posX: node.x, posY: node.y }));

        if (activeMoves.length > 0) {
          onTasksPositionUpdate(activeMoves);
        }
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [onTasksPositionUpdate, tasks]);

  return {
    positions,
    startDrag,
    updateDragMouse,
    endDrag,
    shakeBoard,
    toggleLink,
    ropes,
    nodes: Object.values(nodesRef.current) as PhysicsNode[]
  };
}
