"use client";
// Desktop receive page is a thin wrapper around the PDA receive form —
// they share the same API endpoint and the same field set. We render the
// PDA form inside a max-w-md container that scales fine on desktop; once
// the PDA mobile-responsive CSS pass lands (bugfix #7) the form will
// flex up to fill the desktop space naturally.
import { PdaReceive } from "./pda-receive";

export const OperationsReceive = () => {
  return (
    <div className="py-4">
      <PdaReceive />
    </div>
  );
};
