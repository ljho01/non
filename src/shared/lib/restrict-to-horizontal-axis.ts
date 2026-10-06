import {
  type DragDropManager,
  type Draggable,
  type Droppable,
  Modifier,
  type DragOperation,
} from '@dnd-kit/abstract'

class HorizontalAxisModifier extends Modifier {
  constructor(manager: DragDropManager<Draggable, Droppable>) {
    super(manager)
  }

  public apply(operation: DragOperation) {
    if (this.disabled) return operation.transform

    return {
      x: operation.transform.x,
      y: 0,
    }
  }
}

export const RestrictToHorizontalAxis = HorizontalAxisModifier.configure({})
