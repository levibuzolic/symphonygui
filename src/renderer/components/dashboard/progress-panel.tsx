import type { ImplementationProgress } from '@shared/types'
import { milestoneCompletion, overallCompletion } from '@shared/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'

export function ProgressPanel({ progress }: { progress: ImplementationProgress }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Implementation Progress</CardTitle>
            <CardDescription>Dev-only execution tracker sourced from the repo.</CardDescription>
          </div>
          <Badge>{overallCompletion(progress)}%</Badge>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
