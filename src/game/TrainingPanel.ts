import { TrainingEngine } from './TrainingEngine';
import { FeedbackResult } from './types/training';

/**
 * TrainingPanel manages the UI for training mode
 * Displays instructions, feedback, buttons, and progress
 */
export class TrainingPanel {
  private trainingEngine: TrainingEngine | null = null;
  private containerElement: HTMLElement | null = null;
  private instructionElement: HTMLElement | null = null;
  private feedbackElement: HTMLElement | null = null;
  private progressElement: HTMLElement | null = null;
  private stepNumElement: HTMLElement | null = null;
  private stepTotalElement: HTMLElement | null = null;
  private hintButton: HTMLButtonElement | null = null;
  private bestPlayButton: HTMLButtonElement | null = null;
  private nextButton: HTMLButtonElement | null = null;
  private resetButton: HTMLButtonElement | null = null;

  private onHintCallback: (() => void) | null = null;
  private onBestPlayCallback: (() => void) | null = null;
  private onNextCallback: (() => void) | null = null;
  private onResetCallback: (() => void) | null = null;
  private onExitCallback: (() => void) | null = null;

  constructor() {
    this.createUI();
  }

  /**
   * Create the training panel UI
   */
  private createUI(): void {
    // Create container
    this.containerElement = document.createElement('div');
    this.containerElement.className = 'training-panel';
    this.containerElement.id = 'trainingPanel';

    // Create progress indicator
    this.progressElement = document.createElement('div');
    this.progressElement.className = 'training-progress';
    this.stepNumElement = document.createElement('span');
    this.stepNumElement.textContent = '1';
    this.stepTotalElement = document.createElement('span');
    this.stepTotalElement.textContent = '5';
    this.progressElement.innerHTML = `<div class="progress-label">Step <span id="stepNum">1</span> of <span id="stepTotal">5</span></div>
      <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width: 20%"></div></div>`;

    // Create instruction text
    this.instructionElement = document.createElement('div');
    this.instructionElement.className = 'training-instruction';
    this.instructionElement.id = 'instruction';
    this.instructionElement.textContent = 'Loading lesson...';

    // Create feedback message
    this.feedbackElement = document.createElement('div');
    this.feedbackElement.className = 'training-feedback';
    this.feedbackElement.id = 'feedback';
    this.feedbackElement.style.display = 'none';

    // Create buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'training-buttons';

    // Hint button
    this.hintButton = document.createElement('button');
    this.hintButton.className = 'training-btn hint-btn';
    this.hintButton.id = 'hintBtn';
    this.hintButton.textContent = 'Hint';
    this.hintButton.addEventListener('click', () => this.onHintCallback?.());

    // Best Play button
    this.bestPlayButton = document.createElement('button');
    this.bestPlayButton.className = 'training-btn best-play-btn';
    this.bestPlayButton.id = 'bestPlayBtn';
    this.bestPlayButton.textContent = 'Show Best Play';
    this.bestPlayButton.addEventListener('click', () => this.onBestPlayCallback?.());

    // Next Step button
    this.nextButton = document.createElement('button');
    this.nextButton.className = 'training-btn next-btn';
    this.nextButton.id = 'nextBtn';
    this.nextButton.textContent = 'Next Step';
    this.nextButton.disabled = true;
    this.nextButton.addEventListener('click', () => this.onNextCallback?.());

    // Reset button
    this.resetButton = document.createElement('button');
    this.resetButton.className = 'training-btn reset-btn';
    this.resetButton.textContent = 'Reset';
    this.resetButton.addEventListener('click', () => this.onResetCallback?.());

    // Exit button
    const exitButton = document.createElement('button');
    exitButton.className = 'training-btn exit-btn';
    exitButton.textContent = 'Exit';
    exitButton.addEventListener('click', () => this.onExitCallback?.());

    buttonContainer.appendChild(this.hintButton);
    buttonContainer.appendChild(this.bestPlayButton);
    buttonContainer.appendChild(this.resetButton);
    buttonContainer.appendChild(exitButton);
    buttonContainer.appendChild(this.nextButton);

    // Assemble panel
    this.containerElement.appendChild(this.progressElement);
    this.containerElement.appendChild(this.instructionElement);
    this.containerElement.appendChild(this.feedbackElement);
    this.containerElement.appendChild(buttonContainer);

    this.addStyles();
  }

  /**
   * Add CSS styles for the training panel
   */
  private addStyles(): void {
    const styleId = 'training-panel-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .training-panel {
        position: fixed;
        right: 20px;
        top: 120px;
        width: 320px;
        background: rgba(20, 20, 30, 0.95);
        border: 2px solid rgba(100, 200, 255, 0.3);
        border-radius: 12px;
        padding: 20px;
        color: #e0e0e0;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        display: none;
      }

      .training-panel.active {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .training-progress {
        border-bottom: 1px solid rgba(100, 200, 255, 0.2);
        padding-bottom: 12px;
      }

      .progress-label {
        font-size: 13px;
        color: #a0a0a0;
        margin-bottom: 6px;
      }

      .progress-bar {
        width: 100%;
        height: 6px;
        background: rgba(100, 200, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4fb3d9, #64b5f6);
        transition: width 0.3s ease;
        border-radius: 3px;
      }

      .training-instruction {
        font-size: 15px;
        line-height: 1.5;
        color: #d0d0d0;
        padding: 12px;
        background: rgba(50, 60, 80, 0.3);
        border-left: 3px solid #64b5f6;
        border-radius: 4px;
        min-height: 60px;
        display: flex;
        align-items: center;
      }

      .training-feedback {
        padding: 12px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        animation: slideInFeedback 0.3s ease;
      }

      .training-feedback.success {
        background: rgba(76, 175, 80, 0.2);
        color: #81c784;
        border-left: 3px solid #4caf50;
      }

      .training-feedback.error {
        background: rgba(244, 67, 54, 0.2);
        color: #ef5350;
        border-left: 3px solid #f44336;
      }

      @keyframes slideInFeedback {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .training-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .training-btn {
        padding: 10px 12px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .training-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .training-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .training-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .hint-btn {
        background: rgba(255, 193, 7, 0.2);
        color: #ffc107;
        border: 1px solid rgba(255, 193, 7, 0.4);
      }

      .hint-btn:hover:not(:disabled) {
        background: rgba(255, 193, 7, 0.3);
        border-color: rgba(255, 193, 7, 0.6);
      }

      .best-play-btn {
        background: rgba(76, 175, 80, 0.2);
        color: #4caf50;
        border: 1px solid rgba(76, 175, 80, 0.4);
        grid-column: 1 / -1;
      }

      .best-play-btn:hover:not(:disabled) {
        background: rgba(76, 175, 80, 0.3);
        border-color: rgba(76, 175, 80, 0.6);
      }

      .reset-btn {
        background: rgba(100, 150, 200, 0.2);
        color: #64b5f6;
        border: 1px solid rgba(100, 150, 200, 0.4);
      }

      .reset-btn:hover:not(:disabled) {
        background: rgba(100, 150, 200, 0.3);
        border-color: rgba(100, 150, 200, 0.6);
      }

      .exit-btn {
        background: rgba(200, 100, 100, 0.2);
        color: #ef5350;
        border: 1px solid rgba(200, 100, 100, 0.4);
      }

      .exit-btn:hover:not(:disabled) {
        background: rgba(200, 100, 100, 0.3);
        border-color: rgba(200, 100, 100, 0.6);
      }

      .next-btn {
        background: rgba(100, 200, 255, 0.3);
        color: #64b5f6;
        border: 1px solid rgba(100, 200, 255, 0.6);
      }

      .next-btn:hover:not(:disabled) {
        background: rgba(100, 200, 255, 0.5);
        border-color: rgba(100, 200, 255, 0.8);
      }

      @media (max-width: 768px) {
        .training-panel {
          width: 90vw;
          max-width: 320px;
          right: auto;
          left: 50%;
          transform: translateX(-50%);
          top: auto;
          bottom: 100px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Mount the panel to the DOM
   */
  public mount(parentSelector: string = 'body'): void {
    const parent = document.querySelector(parentSelector);
    if (parent && this.containerElement) {
      parent.appendChild(this.containerElement);
    }
  }

  /**
   * Show the training panel
   */
  public show(): void {
    if (this.containerElement) {
      this.containerElement.classList.add('active');
    }
  }

  /**
   * Hide the training panel
   */
  public hide(): void {
    if (this.containerElement) {
      this.containerElement.classList.remove('active');
    }
  }

  /**
   * Update instruction text
   */
  public setInstruction(text: string): void {
    if (this.instructionElement) {
      this.instructionElement.textContent = text;
    }
  }

  /**
   * Show feedback message
   */
  public showFeedback(result: FeedbackResult): void {
    if (!this.feedbackElement) return;

    this.feedbackElement.textContent = result.message;
    this.feedbackElement.className = 'training-feedback';
    this.feedbackElement.classList.add(result.success ? 'success' : 'error');
    this.feedbackElement.style.display = 'block';

    // Disable next button until correct move
    if (this.nextButton) {
      this.nextButton.disabled = !result.success;
    }

    // Auto-hide after 3 seconds if error
    if (!result.success) {
      setTimeout(() => {
        if (this.feedbackElement) {
          this.feedbackElement.style.display = 'none';
        }
      }, 3000);
    }
  }

  /**
   * Update progress indicator
   */
  public updateProgress(current: number, total: number): void {
    const stepNum = document.getElementById('stepNum');
    if (stepNum) {
      stepNum.textContent = String(current + 1); // 1-indexed for display
    }
    const stepTotal = document.getElementById('stepTotal');
    if (stepTotal) {
      stepTotal.textContent = String(total);
    }
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
      const percentage = ((current + 1) / total) * 100;
      progressFill.style.width = `${percentage}%`;
    }
  }

  /**
   * Enable/disable next button
   */
  public setNextButtonEnabled(enabled: boolean): void {
    if (this.nextButton) {
      this.nextButton.disabled = !enabled;
    }
  }

  /**
   * Register callback for hint button
   */
  public onHint(callback: () => void): void {
    this.onHintCallback = callback;
  }

  /**
   * Register callback for best play button
   */
  public onBestPlay(callback: () => void): void {
    this.onBestPlayCallback = callback;
  }

  /**
   * Register callback for next button
   */
  public onNext(callback: () => void): void {
    this.onNextCallback = callback;
  }

  /**
   * Register callback for reset button
   */
  public onReset(callback: () => void): void {
    this.onResetCallback = callback;
  }

  /**
   * Register callback for exit button
   */
  public onExit(callback: () => void): void {
    this.onExitCallback = callback;
  }

  /**
   * Remove panel from DOM
   */
  public destroy(): void {
    if (this.containerElement && this.containerElement.parentElement) {
      this.containerElement.parentElement.removeChild(this.containerElement);
    }
  }
}

