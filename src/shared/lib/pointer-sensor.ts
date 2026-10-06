import { PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom'

export const PointerSensorPlugin = PointerSensor.configure({
  activationConstraints: [
    new PointerActivationConstraints.Distance({ value: 5 }),
  ],
})
