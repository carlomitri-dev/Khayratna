import { toast } from 'sonner';

export function handleConnectionError(error, fallbackMessage = 'Operation failed') {
  if (!error.response && error.message === 'Network Error') {
    toast.error('Connection Error', {
      description: 'Unable to connect to the server. Please check your internet connection and try again.',
      duration: 5000
    });
    return;
  }
  
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    toast.error('Connection Timeout', {
      description: 'The server took too long to respond. Please try again.',
      duration: 5000
    });
    return;
  }

  const message = error.response?.data?.detail || error.message || fallbackMessage;
  toast.error(fallbackMessage, { description: message, duration: 4000 });
}

export function formatErrorMessage(error, fallbackMessage = 'An error occurred') {
  if (!error.response && error.message === 'Network Error') {
    return 'Connection Error: Unable to connect to the server. Please check your internet connection.';
  }
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return 'Connection Timeout: The server took too long to respond.';
  }
  return error.response?.data?.detail || error.message || fallbackMessage;
}
