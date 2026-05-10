"use client";

import { setOptions } from "@/components/helpers/utils";
import {
  m_addresses,
  m_avatar,
  m_br,
  m_cards,
  m_credit_card,
  m_email,
  m_password,
  m_select,
  m_switch,
  m_text,
  m_title,
} from "@/components/modal/custom-modal-item";

import PageLayout from "@/components/page-layout";
import { http_request } from "@/lib/httpRequest";
import { OptionItem } from "@/types/Utils";
import { IconCreditCard } from "@tabler/icons-react";
import { Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function Page(param: any) {
  const t = useTranslations();
  const [langCode, setLangCode] = useState("en");
  const [logisticPartyList, setLogisticPartyList] = useState<OptionItem[]>([]);

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
    http_request("GET", "/api/cms/list/logistic-party", {
      lang: response.locale,
    }).then(async (data) => {
      const json = await data.json();
      setOptions(setLogisticPartyList, json);
    });
  };

  const props = {
    title: "account.page.title",
    description: "account.page.description",
    api: "/api/cms/account",
    path: [
      { name: "menu.account", href: "#" },
      { name: "menu.profile", href: "#" },
    ],
    form: {
      id: "form_edit",
      api: "GET:/api/cms/account",
      fields: [
        m_title(t("utils.basic")),
        m_text(t("account.fields.username"), "username", {
          is_readonly: true,
          className: "col-span-2 mb-3",
        }),
        m_text(t("account.fields.firstname"), "firstName"),
        m_text(t("account.fields.lastname"), "lastName"),
        m_avatar(t("account.fields.avatar"), "avatar", {
          className: "col-span-2 mb-3",
        }),
        m_email(t("utils.email"), "email", {
          className: "col-span-2 mb-3",
        }),
        m_title(t("account.fields.address")),
        m_addresses(t("account.fields.address"), "addresses", {
          className: "col-span-2 mb-3",
        }),
        // m_title(t("account.fields.appearance")),
        // m_title(t("account.fields.notifications")),
        m_title(t("account.fields.account")),
        m_switch(t("account.fields.passwordChange"), "is_passwordChange", {
          description: t("account.page.passwordChange"),
          className: "col-span-2 mb-3",
        }),
        m_password(t("account.fields.currentPassword"), "currentPassword", {
          show: [["is_passwordChange", true]],
          className: "col-span-2 mb-3",
        }),
        m_password(t("account.fields.newPassword"), "newPassword", {
          show: [["is_passwordChange", true]],
        }),
        m_password(t("account.fields.confirmPassword"), "confirmPassword", {
          show: [["is_passwordChange", true]],
        }),

        m_title(t("account.fields.paymentSetting")),

        m_cards(t("account.fields.payment"), "payments", {
          className: "col-span-2 mb-3",
          max: 1,
          fields: [
            m_select(
              t("account.fields.paymentMethod"),
              "paymentMethod",
              [
                {
                  value: "credit_card",
                  label: t("account.fields.creditCard"),
                },
              ],
              { is_readonly: true }
            ),
            m_br(),
            m_credit_card(t("account.fields.cardNumber"), "cardNumber"),
            m_text(t("account.fields.holderName"), "cardHolder"),
            m_text(t("utils.expiredAt"), "expiryDate", {
              placeholder: "MM/YY",
            }),
            m_password(t("account.fields.cvv"), "cvv", {
              r_icon: (
                <div className="w-4 h-4 ml-1" title="CVV">
                  <IconCreditCard />
                </div>
              ),
            }),
          ],
          default: {
            paymentMethod: "credit_card",
          },
        }),

        m_title(t("account.fields.api")),
        m_switch(t("account.fields.is_api_enabled"), "is_api_enabled", {
          description: t("account.page.is_api_enabled"),
          className: "col-span-2 mb-3",
        }),
        m_cards(t("account.fields.apiKey"), "apiTokens", {
          className: "col-span-2 mb-3",
          is_readonly: true,
          show: [["is_api_enabled", true]],
          fields: [
            {
              type: "alert",
              text: t("account.fields.secret"),
              description: t("account.page.secret"),
              icon: <Terminal className="h-4 w-4" />,
              show: [["apiTokens.0.secret", "!=", undefined]],
            },
            {
              type: "text",
              text: t("account.fields.apiKey"),
              key: "apiKey",
              is_readonly: true,
            },
            {
              type: "text",
              text: t("account.fields.secret"),
              key: "secret",
              placeholder: "********",
              is_readonly: true,
            },
          ],
        }),

        m_cards(t("account.fields.connect_3rd_party"), "externalTokens", {
          className: "col-span-2 mb-3",
          fields: [
            m_select(
              t("account.fields.platform"),
              "platform",
              logisticPartyList
            ),
            m_br(),
            m_text("App ID", "appId"),
            m_text("Secret", "secret"),
            m_switch(t("utils.isActive"), "isActive"),
          ],
          default: {
            platform: "yunexpress",
            appId: "",
            secret: "",
            isActive: false,
          },
        }),
        m_cards(t("account.fields.notifyApiUrl"), "notifyApis", {
          className: "col-span-2 mb-3",
          description: t("account.page.notifyApiUrl"),
          fields: [
            {
              type: "text",
              text: t("account.fields.url"),
              key: "url",
              placeholder:
                "https://example.com/api/notify?order_id={order_id}&order_type={order_type}",
              className: "col-span-2 mb-3",
            },
          ],
        }),
      ],
      buttons: [
        {
          text: t("button.update"),
          actions: ["PUT:/api/cms/account", "reload"],
        },
      ],
      options: {
        tab: "horizontal",
      },
    },
    toolbar: [],
    init,
  };

  return (
    <>
      <PageLayout {...props}></PageLayout>;
    </>
  );

  //  return
}
