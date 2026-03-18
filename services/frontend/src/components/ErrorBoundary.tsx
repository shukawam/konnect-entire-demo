'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>問題が発生しました</h2>
          <p>申し訳ございません。予期しないエラーが発生しました。</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
