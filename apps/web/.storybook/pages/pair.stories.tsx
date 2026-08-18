import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState, type ComponentProps } from 'react'

import { PairPage } from '#/pages/pair/pair-page.tsx'

const meta = {
  title: 'Pages/Pair',
  component: PairPage,
} satisfies Meta<typeof PairPage>

export default meta
type Story = StoryObj<typeof meta>

function PairHarness(props: Pick<ComponentProps<typeof PairPage>, 'pending' | 'error' | 'code'>) {
  const [code, setCode] = useState(props.code)
  return (
    <PairPage
      code={code}
      pending={props.pending}
      error={props.error}
      onCodeChange={setCode}
      onSubmit={() => undefined}
    />
  )
}

export const Ready: Story = {
  args: {
    code: '7K2M9Q',
    pending: false,
    error: undefined,
    onCodeChange: () => undefined,
    onSubmit: () => undefined,
  },
  render: () => <PairHarness code="7K2M9Q" pending={false} error={undefined} />,
}

export const EmptyCode: Story = {
  args: Ready.args,
  render: () => <PairHarness code="" pending={false} error={undefined} />,
}

export const InvalidCode: Story = {
  args: Ready.args,
  render: () => <PairHarness code="ZZZZZZ" pending={false} error="That code is expired." />,
}
