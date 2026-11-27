import * as React from 'react'
import * as Primitive from '@radix-ui/react-dialog'

// Local shadcn/ui-style component: Radix behavior with LiftInk's single glass theme.
export const Root = Primitive.Root
export const Portal = Primitive.Portal
export const Close = Primitive.Close
export const Description = Primitive.Description

export function Overlay(props: React.ComponentProps<typeof Primitive.Overlay>): React.JSX.Element {
  return <Primitive.Overlay data-slot="dialog-overlay" {...props} />
}
export function Content(props: React.ComponentProps<typeof Primitive.Content>): React.JSX.Element {
  return <Primitive.Content data-slot="dialog-content" {...props} />
}
export function Title(props: React.ComponentProps<typeof Primitive.Title>): React.JSX.Element {
  return <Primitive.Title data-slot="dialog-title" {...props} />
}
