/**
 * Career Roadmap Generation Job Manager
 * 
 * Manages async roadmap generation jobs with cancellation support.
 * Uses in-memory Map to track active jobs and their AbortControllers.
 */

// Map of goalId -> AbortController for cancellation
const activeJobs = new Map<string, AbortController>();

/**
 * Register a new roadmap generation job
 * @param goalId The career goal ID
 * @returns AbortController for this job
 */
export function registerJob(goalId: string): AbortController {
  // Cancel any existing job for this goal
  const existingController = activeJobs.get(goalId);
  if (existingController) {
    existingController.abort();
  }

  // Create new AbortController
  const controller = new AbortController();
  activeJobs.set(goalId, controller);
  return controller;
}

/**
 * Get the AbortController for a job
 * @param goalId The career goal ID
 * @returns AbortController or null if job doesn't exist
 */
export function getJobController(goalId: string): AbortController | null {
  return activeJobs.get(goalId) || null;
}

/**
 * Cancel a roadmap generation job
 * @param goalId The career goal ID
 * @returns true if job was cancelled, false if job doesn't exist
 */
export function cancelJob(goalId: string): boolean {
  const controller = activeJobs.get(goalId);
  if (controller) {
    controller.abort();
    activeJobs.delete(goalId);
    return true;
  }
  return false;
}

/**
 * Remove a job from tracking (called when job completes)
 * @param goalId The career goal ID
 */
export function unregisterJob(goalId: string): void {
  activeJobs.delete(goalId);
}

/**
 * Check if a job is currently active
 * @param goalId The career goal ID
 * @returns true if job is active
 */
export function isJobActive(goalId: string): boolean {
  return activeJobs.has(goalId);
}

