import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCurrentLangCode, lang } from "@/lang/base";
import { http_request } from "@/lib/httpRequest";
import { IconLogout } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import Link from "next/link";
import React, { useEffect } from "react";

export function UserNav() {
  const [user, setUser] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    avatar: "",
  });
  useEffect(() => {
    http_request("GET", "/api/cms/account").then((response) => {
      response.json().then((json: any) => {
        setUser(
          json.data || {
            firstName: "",
            lastName: "",
            email: "",
          }
        );
      });
    });
  }, []);
  // legacy `lang()` dictionary uses underscored keys (zh_hk) for lookup,
  // but Next.js routes use hyphenated locale segments (zh-hk). Keep the
  // legacy code for label text, but use next-intl's useLocale() for URL
  // construction so /logout actually resolves.
  const langCode = getCurrentLangCode();
  const routeLocale = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            {user.avatar != "" && <AvatarImage src={user.avatar} />}
            <AvatarFallback>
              {(user.firstName[0] || "...").toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.firstName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Link
              href={"/" + routeLocale + "/logout"}
              title={lang("utils.logout")}
              className="flex items-center space-x-2 justify-between w-full"
            >
              {lang("utils.logout")}
              <DropdownMenuShortcut>
                <IconLogout size={14} stroke={1} />
              </DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
