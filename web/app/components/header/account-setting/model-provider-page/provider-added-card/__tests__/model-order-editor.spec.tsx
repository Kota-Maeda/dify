import type { ModelItem, ModelProvider } from '../../declarations'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigurationMethodEnum, ModelTypeEnum } from '../../declarations'
import ModelOrderEditor from '../model-order-editor'

const { mockUpdateModelsOrder, mockUpdateModelList, mockToastSuccess } = vi.hoisted(() => ({
  mockUpdateModelsOrder: vi.fn(),
  mockUpdateModelList: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

vi.mock('@/service/console', () => ({
  consoleQuery: {
    workspaces: {
      current: {
        modelProviders: {
          byProvider: { models: { order: { patch: { mutationOptions: () => ({}) } } } },
        },
      },
    },
  },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: () => ({ mutateAsync: mockUpdateModelsOrder }),
}))

vi.mock('../../hooks', () => ({
  useUpdateModelList: () => mockUpdateModelList,
}))

vi.mock('@/app/notifications', () => ({
  toast: { success: mockToastSuccess, error: vi.fn() },
}))

vi.mock('../../model-icon', () => ({ default: () => null }))

vi.mock('../../model-name', () => ({
  default: ({ modelItem }: { modelItem: ModelItem }) => <span>{modelItem.model}</span>,
}))

const provider = { provider: 'test-provider' } as unknown as ModelProvider

const buildModel = (model: string, modelType: ModelTypeEnum, fetchFrom: ConfigurationMethodEnum) =>
  ({ model, model_type: modelType, fetch_from: fetchFrom }) as unknown as ModelItem

const models = [
  buildModel(
    'custom-llm-a',
    ModelTypeEnum.textGeneration,
    ConfigurationMethodEnum.customizableModel,
  ),
  buildModel(
    'predefined-llm',
    ModelTypeEnum.textGeneration,
    ConfigurationMethodEnum.predefinedModel,
  ),
  buildModel(
    'custom-llm-b',
    ModelTypeEnum.textGeneration,
    ConfigurationMethodEnum.customizableModel,
  ),
  buildModel(
    'custom-embedding-a',
    ModelTypeEnum.textEmbedding,
    ConfigurationMethodEnum.customizableModel,
  ),
  buildModel(
    'custom-embedding-b',
    ModelTypeEnum.textEmbedding,
    ConfigurationMethodEnum.customizableModel,
  ),
]

const handle = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^common\\.sort\\.handle.*${name}`) })
const saveButton = () => screen.getByRole('button', { name: /operation\.save/ })

// Move the first item of a group down by one with the keyboard.
const moveDown = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  handle(name).focus()
  await user.keyboard('{Enter}{ArrowDown}{Enter}')
}

describe('ModelOrderEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists only custom models and disables save until the order changes', () => {
    render(<ModelOrderEditor provider={provider} models={models} onCancel={vi.fn()} />)

    expect(screen.getByText('custom-llm-a')).toBeInTheDocument()
    expect(screen.getByText('custom-embedding-b')).toBeInTheDocument()
    expect(screen.queryByText('predefined-llm')).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('saves only the reordered model type and closes', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onSaved = vi.fn()
    mockUpdateModelsOrder.mockResolvedValue({ result: 'success' })
    render(
      <ModelOrderEditor
        provider={provider}
        models={models}
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    )

    await moveDown(user, 'custom-llm-a')
    await user.click(saveButton())

    await waitFor(() => expect(onCancel).toHaveBeenCalled())
    expect(mockUpdateModelsOrder).toHaveBeenCalledExactlyOnceWith({
      params: { provider: 'test-provider' },
      body: {
        model_type: ModelTypeEnum.textGeneration,
        models: ['custom-llm-b', 'custom-llm-a'],
      },
    })
    expect(mockUpdateModelList).toHaveBeenCalledExactlyOnceWith(ModelTypeEnum.textGeneration)
    expect(onSaved).toHaveBeenCalledWith('test-provider')
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it('refreshes the list but stays open when a later model type fails to save', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onSaved = vi.fn()
    mockUpdateModelsOrder
      .mockResolvedValueOnce({ result: 'success' })
      .mockRejectedValueOnce(new Error('boom'))
    render(
      <ModelOrderEditor
        provider={provider}
        models={models}
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    )

    await moveDown(user, 'custom-llm-a')
    await moveDown(user, 'custom-embedding-a')
    await user.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('test-provider'))
    expect(mockUpdateModelsOrder).toHaveBeenCalledTimes(2)
    expect(mockUpdateModelList).toHaveBeenCalledExactlyOnceWith(ModelTypeEnum.textGeneration)
    expect(onCancel).not.toHaveBeenCalled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(saveButton()).toBeEnabled()
  })
})
