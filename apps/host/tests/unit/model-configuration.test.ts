import {
  applyModelSelection,
  modelsToConfigurationOptions,
  type AcpSessionModels,
} from '@host/infrastructure/acp/acp-content.ts'
import { describe, expect, it } from 'vitest'

/** The shape grok 1.0.13 advertises on `session/new`, cut to what the mapping reads. */
const models: AcpSessionModels = {
  currentModelId: 'grok-4.6',
  availableModels: [
    {
      modelId: 'grok-4.6',
      name: 'Grok 4.6',
      description: "SpaceXAI's latest frontier model",
      _meta: {
        supportsReasoningEffort: true,
        reasoningEffort: 'high',
        reasoningEfforts: [
          {
            id: 'xhigh',
            label: 'Extra High Effort',
            description: 'Highest effort',
            default: false,
          },
          { id: 'high', label: 'High Effort', description: 'Extensive reasoning', default: true },
          { id: 'medium', label: 'Medium Effort', default: false },
          { id: 'low', label: 'Low Effort', default: false },
        ],
      },
    },
    { modelId: 'grok-4.5', name: 'Grok 4.5', _meta: { totalContextTokens: 500_000 } },
  ],
}

describe('modelsToConfigurationOptions', () => {
  it('emits the model select and the current model efforts', () => {
    const options = modelsToConfigurationOptions(models)
    expect(options).toMatchObject([
      {
        id: 'model',
        currentValue: 'grok-4.6',
        options: [{ value: 'grok-4.6', name: 'Grok 4.6' }, { value: 'grok-4.5' }],
      },
      {
        id: 'effort',
        currentValue: 'high',
        options: [
          { value: 'xhigh', name: 'Extra High Effort' },
          { value: 'high' },
          { value: 'medium' },
          { value: 'low' },
        ],
      },
    ])
  })

  it('emits only the model select when the current model has no efforts', () => {
    const options = modelsToConfigurationOptions({ ...models, currentModelId: 'grok-4.5' })
    expect(options.map((option) => option.id)).toEqual(['model'])
  })

  it('falls back to the default effort when the advertised one is unknown', () => {
    const [first] = models.availableModels
    const drifted: AcpSessionModels = {
      ...models,
      availableModels: [
        { ...first!, _meta: { ...first!._meta, reasoningEffort: 'turbo' } },
        ...models.availableModels.slice(1),
      ],
    }
    expect(modelsToConfigurationOptions(drifted)[1]).toMatchObject({ currentValue: 'high' })
  })
})

describe('applyModelSelection', () => {
  it('keeps the chosen effort on the selected model', () => {
    const next = applyModelSelection(models, 'grok-4.6', 'low')
    expect(modelsToConfigurationOptions(next)[1]).toMatchObject({ currentValue: 'low' })
  })

  it('resets the effort to the model default when none was sent', () => {
    const lowered = applyModelSelection(models, 'grok-4.6', 'low')
    const reset = applyModelSelection(lowered, 'grok-4.6')
    expect(modelsToConfigurationOptions(reset)[1]).toMatchObject({ currentValue: 'high' })
  })

  it('switches the current model', () => {
    const next = applyModelSelection(models, 'grok-4.5')
    expect(next.currentModelId).toBe('grok-4.5')
    expect(modelsToConfigurationOptions(next).map((option) => option.id)).toEqual(['model'])
  })
})
