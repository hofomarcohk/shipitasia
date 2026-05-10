export function ModalLabel<TData, TValue>({
  text,
  isRequired,
}: {
  text: string;
  isRequired: boolean;
}) {
  return (
    <label className="text-sm font-semibold text-[#333] dark:text-[#f0f0f0]">
      {text}
      {isRequired && <span className="text-[#f00]">*</span>}
    </label>
  );
}
