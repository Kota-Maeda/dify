import type { ModelProviderSummaryResponse } from '@dify/contracts/api/console/workspaces/types.gen'
import type { ModelItem, ModelProvider, ModelTypeEnum } from '../declarations'
import { Button } from '@langgenius/dify-ui/button'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactSortable } from 'react-sortablejs'
import { useKeyboardSortable } from '@/app/components/base/keyboard-sortable/use-keyboard-sortable'
import { toast } from '@/app/notifications'
import { consoleQuery } from '@/service/console'
import { ConfigurationMethodEnum } from '../declarations'
import { useUpdateModelList } from '../hooks'
import ModelIcon from '../model-icon'
import ModelName from '../model-name'
import { modelTypeFormat } from '../utils'

type SortableModel = ModelItem & { id: string }

type ModelGroup = {
  modelType: ModelTypeEnum
  models: SortableModel[]
}

// Group custom models by type, keeping the current display order. Only custom models can be ordered.
const groupCustomModels = (models: ModelItem[]): ModelGroup[] => {
  const groups = new Map<ModelTypeEnum, SortableModel[]>()
  for (const model of models) {
    if (model.fetch_from !== ConfigurationMethodEnum.customizableModel) continue
    const group = groups.get(model.model_type) ?? []
    group.push({ ...model, id: `${model.model_type}-${model.model}` })
    groups.set(model.model_type, group)
  }
  return [...groups].map(([modelType, groupModels]) => ({ modelType, models: groupModels }))
}

const isSameOrder = (a: SortableModel[], b: SortableModel[]) =>
  a.length === b.length && a.every((model, index) => model.id === b[index]?.id)

type SortableModelGroupProps = {
  provider: ModelProvider | ModelProviderSummaryResponse
  group: ModelGroup
  showTitle: boolean
  disabled: boolean
  onChange: (models: SortableModel[]) => void
}

const SortableModelGroup = ({
  provider,
  group,
  showTitle,
  disabled,
  onChange,
}: SortableModelGroupProps) => {
  const { items, getHandleProps, getItemKey, isSorting, announcement } = useKeyboardSortable({
    items: group.models,
    onChange,
    disabled,
    getItemLabel: (model) => model.model,
  })

  const handlePointerReorder = (list: SortableModel[]) => {
    if (isSorting || isSameOrder(list, group.models)) return
    onChange(list)
  }

  return (
    <div className="mb-1">
      {announcement}
      {showTitle && (
        <div className="px-1 py-1 system-xs-medium-uppercase text-text-tertiary">
          {modelTypeFormat(group.modelType)}
        </div>
      )}
      <ReactSortable
        list={items}
        setList={handlePointerReorder}
        disabled={disabled || isSorting}
        handle=".handle"
        ghostClass="opacity-50"
        animation={150}
      >
        {items.map((model, index) => (
          <div
            key={getItemKey(index)}
            className="flex h-8 items-center rounded-lg pr-2.5 pl-1 hover:bg-components-panel-on-panel-item-bg-hover"
          >
            <button
              {...getHandleProps(index)}
              className="handle mr-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-text-quaternary outline-hidden hover:bg-state-base-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid active:cursor-grabbing disabled:cursor-not-allowed aria-pressed:bg-state-accent-hover"
            >
              <span aria-hidden className="i-ri-draggable size-4" />
            </button>
            <ModelIcon className="mr-2 shrink-0" provider={provider} modelName={model.model} />
            <ModelName className="grow system-md-regular text-text-secondary" modelItem={model} />
          </div>
        ))}
      </ReactSortable>
    </div>
  )
}

type ModelOrderEditorProps = {
  provider: ModelProvider | ModelProviderSummaryResponse
  models: ModelItem[]
  onCancel: () => void
  onSaved?: (provider: string) => void
}

const ModelOrderEditor = ({ provider, models, onCancel, onSaved }: ModelOrderEditorProps) => {
  const { t } = useTranslation(['common', 'modelProvider'])
  // Snapshot of the order when editing started; custom model actions are hidden while editing.
  const [initialGroups] = useState(() => groupCustomModels(models))
  const [groups, setGroups] = useState(initialGroups)
  const [isSaving, setIsSaving] = useState(false)
  const { mutateAsync: updateModelsOrder } = useMutation(
    consoleQuery.workspaces.current.modelProviders.byProvider.models.order.patch.mutationOptions(),
  )
  const updateModelList = useUpdateModelList()

  const changedGroups = groups.filter((group, index) => {
    const initialGroup = initialGroups[index]
    return !initialGroup || !isSameOrder(group.models, initialGroup.models)
  })

  const setGroupModels = (modelType: ModelTypeEnum, groupModels: SortableModel[]) => {
    setGroups((prev) =>
      prev.map((group) =>
        group.modelType === modelType ? { ...group, models: groupModels } : group,
      ),
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    let savedCount = 0
    try {
      for (const group of changedGroups) {
        await updateModelsOrder({
          params: { provider: provider.provider },
          body: {
            model_type: group.modelType,
            models: group.models.map((model) => model.model),
          },
        })
        savedCount += 1
        updateModelList(group.modelType)
      }
      toast.success(t(($) => $['api.actionSuccess'], { ns: 'common' }))
      onCancel()
    } catch {
      // Request errors are already reported by the fetch layer; stay in the editor so the user can retry.
    } finally {
      setIsSaving(false)
      // Refresh even after a partial failure so the list shows what was persisted.
      if (savedCount > 0) onSaved?.(provider.provider)
    }
  }

  return (
    <div className="px-1 py-1">
      <div className="px-1 pb-1 system-xs-regular text-text-tertiary">
        {t(($) => $['modelProvider.sortModelsTip'], { ns: 'modelProvider' })}
      </div>
      {groups.map((group) => (
        <SortableModelGroup
          key={group.modelType}
          provider={provider}
          group={group}
          showTitle={groups.length > 1}
          disabled={isSaving}
          onChange={(groupModels) => setGroupModels(group.modelType, groupModels)}
        />
      ))}
      <div className="flex justify-end gap-2 px-1 pt-1">
        <Button size="small" variant="secondary" onClick={onCancel} disabled={isSaving}>
          {t(($) => $['operation.cancel'], { ns: 'common' })}
        </Button>
        <Button
          size="small"
          variant="primary"
          onClick={handleSave}
          loading={isSaving}
          disabled={!changedGroups.length}
        >
          {t(($) => $['operation.save'], { ns: 'common' })}
        </Button>
      </div>
    </div>
  )
}

export default ModelOrderEditor
