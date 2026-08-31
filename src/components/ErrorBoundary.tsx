/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || "An unexpected error occurred." };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] w-full bg-[#070709] text-stone-200 flex flex-col items-center justify-center p-6 font-mono border border-[#ff007f]/30">
          <div className="max-w-md w-full bg-[#111622] border border-[#ff007f]/40 p-6 shadow-2xl rounded text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#ff007f]/10 border border-[#ff007f]/40 flex items-center justify-center mx-auto text-[#ff007f]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-widest text-white uppercase">
                SCANIMATION ENGINE RESTORED
              </h2>
              <p className="text-xs text-stone-400 mt-1">
                {this.state.errorMessage || "A rendering operation was safely intercepted. Click below to continue."}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-[#ff007f] hover:bg-[#ff1a8c] text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[0_0_15px_rgba(255,0,127,0.3)]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>CONTINUE EDITING</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
