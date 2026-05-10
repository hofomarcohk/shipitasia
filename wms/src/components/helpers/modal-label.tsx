export function ModalLabel<TData, TValue>({
  text,
  isRequired,
  description,
  options,
}: {
  text: string;
  isRequired: boolean;
  description?: string;
  options?: any;
}) {
  return (
    <div className={options?.isOneLine ? "flex items-center" : ""}>
      <label className="text-sm font-semibold text-[#333] dark:text-[#f0f0f0]">
        {text}
        {isRequired && <span className="text-[#f00]">*</span>}
      </label>
      <div className="text-[#444] text-[12px]">{description}</div>
    </div>
  );
}
