import { describe, expect, it } from 'vitest'
import { implementationProgress, overallCompletion } from '../src/shared/progress'

describe('progress artifact', () => {
  it('computes overall completion from tasks', () => {
    expect(overallCompletion(implementationProgress)).toBeGreaterThan(50)
  })
})
