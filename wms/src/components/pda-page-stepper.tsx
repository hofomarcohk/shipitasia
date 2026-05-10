"use client";

import { useTranslations } from "next-intl";

export default function PdaPageStepperLayout(prop: {
  steps: { name: string; title: string; description: string }[];
  currentStep: string;
  setStep: (step: string) => void;
}) {
  const { steps, currentStep, setStep } = prop;
  const stepIndex = steps.findIndex((step) => step.name === currentStep);

  const previousStep = stepIndex > 0 ? steps[stepIndex - 1] : null;
  const currentStepData = steps[stepIndex];
  const nextStep = stepIndex < steps.length - 1 ? steps[stepIndex + 1] : null;
  const stepDesc = currentStepData?.description;
  const t = useTranslations();
  return (
    <>
      <div className="w-full max-w-4xl px-4 py-2 ">
        <div className="flex items-center justify-between gap-1 mb-4 text-gray-700 text-xs font-medium text-center">
          {previousStep && (
            <div
              className="flex-2 cursor-pointer text-blue-500"
              onClick={() => setStep(previousStep.name)}
            >
              {previousStep.title}
            </div>
          )}
          {previousStep && (
            <div className="flex-1 border-b-2 border-blue-500"></div>
          )}
          {currentStepData && (
            <div className="flex-2 cursor-pointer text-blue-500">
              {currentStepData.title}
            </div>
          )}
          <div className="flex-1 border-b-2 border-gray-700"></div>
          {nextStep && (
            <div className="flex-2 cursor-pointer text-gray-700">
              {nextStep.title}
            </div>
          )}
          {nextStep && (
            <div className="flex-1 border-b-2 border-gray-700 relative">
              {steps.length - stepIndex - 2 > 0 && (
                <div className="absolute top-0 left-0 right-0 bottom-0 bg-gray-700rounded-full">
                  {steps.length - stepIndex - 2}+
                </div>
              )}
            </div>
          )}
          <div className="flex-2 cursor-pointer text-gray-700 ">
            {t("utils.done")}
          </div>
        </div>
      </div>
      <div className="text-xs pl-2">{stepDesc}</div>
    </>
  );
}
