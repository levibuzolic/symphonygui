import type { ImplementationProgress } from '@shared/types'
import { milestoneCompletion, overallCompletion } from '@shared/progress'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'

export function ProgressPanel({ progress }: { progress: ImplementationProgress }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Implementation Progress</div>
          <div className="mt-1 text-sm text-zinc-300">Dev-only execution tracker sourced from the repo.</div>
        </div>
        <Badge>{overallCompletion(progress)}%</Badge>
      </div>
      <div className="space-y-3">
        {progress.milestones.map((milestone) => (
          <div key={milestone.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">{milestone.label}</div>
                <div className="text-xs text-zinc-500">{milestone.verification}</div>
              </div>
              <Badge>{milestoneCompletion(milestone)}%</Badge>
            </div>
            <div className="h-1.5 rounded-full bg-white/5">
              <div className="h-1.5 rounded-full bg-white" style={{ width: `${milestoneCompletion(milestone)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
