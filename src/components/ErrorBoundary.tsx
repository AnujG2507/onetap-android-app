import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { crashReporting, BreadcrumbCategory } from '@/lib/crashReporting';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    
    // Report to crash reporting service
    crashReporting.addBreadcrumb(BreadcrumbCategory.ERROR, `Component stack: ${errorInfo.componentStack?.slice(0, 200)}`);
    crashReporting.recordError(error, {
      componentStack: errorInfo.componentStack || 'unknown'
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
          <div className="text-center space-y-4 max-w-sm">
            <div className="h-16 w-16 mx-auto rounded-full bg-muted flex items-center justify-center">
              <RefreshCw className="h-8 w-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground">
              The app encountered an unexpected error. Please refresh to continue.
            </p>
            <Button onClick={this.handleReload} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh App
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
