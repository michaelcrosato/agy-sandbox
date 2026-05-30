import cluster from "cluster";

/**
 * Pure supervisor worker planner (spec 019c).
 * Given the desired shard count and the currently alive workers, decide
 * what processes need to be spawned or terminated.
 *
 * @param {Object} params
 * @param {number} params.shardCount - Total number of shards (WORKERS)
 * @param {Array<{ id: string, shardIndex: number }>} params.liveWorkers - List of currently running workers
 * @returns {{ spawn: Array<number>, terminate: Array<string> }} The plan of action.
 */
export function planWorkers({ shardCount, liveWorkers }) {
  const spawn = [];
  const terminate = [];

  // Track active shards and duplicate workers
  const activeShards = new Set();

  for (const worker of liveWorkers) {
    const sIdx = worker.shardIndex;
    if (sIdx >= 0 && sIdx < shardCount) {
      if (activeShards.has(sIdx)) {
        // Duplicate worker for the same shard index: plan to terminate it.
        terminate.push(worker.id);
      } else {
        activeShards.add(sIdx);
      }
    } else {
      // Out of bounds shard index (e.g. if shardCount was reduced): plan to terminate.
      terminate.push(worker.id);
    }
  }

  // Find any shard index that does not have an active worker
  for (let sIdx = 0; sIdx < shardCount; sIdx++) {
    if (!activeShards.has(sIdx)) {
      spawn.push(sIdx);
    }
  }

  return { spawn, terminate };
}

/**
 * Supervisor orchestrator (spec 019c).
 * Forks and maintains N worker processes, mapping each to a specific shard index.
 * Self-heals by restarting dead workers using the pure planWorkers decision policy.
 * @param {number} workersCount
 */
export function runSupervisor(workersCount) {
  console.log(
    `🛡️  NEBULA SUPERVISOR: Initializing with ${workersCount} shards/workers...`,
  );

  // Map worker.id -> { id: string, shardIndex: number, processId: number }
  const liveWorkers = new Map();

  const spawnShard = (shardIndex) => {
    console.log(
      `⚙️  Supervisor: Spawning child worker for Shard [${shardIndex}]...`,
    );
    // Fork a new worker process, passing SHARD_INDEX and WORKERS env variables
    const worker = cluster.fork({
      SHARD_INDEX: String(shardIndex),
      WORKERS: String(workersCount),
    });

    liveWorkers.set(worker.id, {
      id: worker.id,
      shardIndex,
      processId: worker.process.pid,
    });
  };

  // Perform initial planning and spawn workers
  const plan = planWorkers({
    shardCount: workersCount,
    liveWorkers: Array.from(liveWorkers.values()),
  });

  for (const sIdx of plan.spawn) {
    spawnShard(sIdx);
  }

  // Monitor exits and crash restart
  cluster.on("exit", (worker, code, signal) => {
    const wInfo = liveWorkers.get(worker.id);
    if (wInfo) {
      console.warn(
        `⚠️  Supervisor Warning: Worker ID [${worker.id}] (Shard [${wInfo.shardIndex}], PID [${wInfo.processId}]) exited (code: ${code}, signal: ${signal})`,
      );
      liveWorkers.delete(worker.id);

      // Trigger planning for self-healing/restarting
      const nextPlan = planWorkers({
        shardCount: workersCount,
        liveWorkers: Array.from(liveWorkers.values()),
      });

      for (const sIdx of nextPlan.spawn) {
        console.log(
          `⚙️  Supervisor Self-Healing: Restarting worker for Shard [${sIdx}]...`,
        );
        spawnShard(sIdx);
      }
    }
  });
}
