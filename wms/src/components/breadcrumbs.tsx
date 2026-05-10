import { useTranslations } from "next-intl";
import React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

const Breadcrumbs = (prop: { path: { name: string; href: string }[] }) => {
  const t = useTranslations();
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {prop.path.map((item, index) => (
          <React.Fragment key={index}>
            <BreadcrumbItem>
              <BreadcrumbLink href={item.href}>{t(item.name)}</BreadcrumbLink>
            </BreadcrumbItem>
            {index < prop.path.length - 1 && (
              <BreadcrumbSeparator className="hidden md:block" />
            )}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export { Breadcrumbs };
