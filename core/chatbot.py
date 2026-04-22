import os
import json
import traceback
from decimal import Decimal
from dotenv import load_dotenv
from openai import OpenAI
from .scraper import get_available_filters, search_products
from .models import ProductCache, Roadmap, RoadmapItem


# All available Onliner catalog categories for active tourism
ALL_CATEGORIES = {
    # Bikes
    "bike": "Велосипеды",
    "kidsbike": "Детские велосипеды",
    "bikehelmet": "Велошлемы",
    "bikeseat": "Велосипедные сёдла и детские кресла",
    "bike_accessories": "Велоаксессуары",
    "bike_pump": "Велонасосы",
    "bike_tools": "Велоинструменты",
    "bike_parts": "Велозапчасти",
    "bicyclerack": "Велобагажники",
    "bikecomp": "Велокомпьютеры",
    "bicycle_tires": "Велопокрышки и камеры",
    # Camping
    "tents": "Палатки",
    "sleepingbag": "Спальные мешки",
    "backpack": "Рюкзаки",
    "airbed": "Надувные матрасы",
    "travel_mat": "Туристические коврики",
    "camp_furniture": "Кемпинговая мебель",
    # Cooking
    "camping_cookware": "Туристическая посуда",
    "thermosbottle": "Термосы",
    "water_bottles": "Бутылки для воды",
    "kazan": "Казаны",
    "gascylinder": "Газовые баллоны",
    "grill": "Грили и мангалы",
    "bbq_accessories": "Аксессуары для барбекю",
    "arrefrigerator": "Автохолодильники",
    # Electronics
    "actioncamera": "Экшн-камеры",
    "actioncamera_acs": "Аксессуары для экшн-камер",
    "travelgps": "Туристические GPS-навигаторы",
    "portableradio": "Портативные радиостанции",
    "radio": "Рации",
    # Outdoors
    "lights": "Фонари",
    "foldingknives": "Ножи и мультитулы",
    "swimming_goods": "Товары для плавания",
    "rubberboots": "Резиновые сапоги",
    "insect_protect": "Защита от насекомых",
    "optic": "Бинокли и оптика",
    "telescope": "Телескопы",
    "camera_traps": "Фотоловушки",
    "metal_search": "Металлоискатели",
    # Fishing & Water
    "inflatableboat": "Надувные лодки",
    "outboardmotors": "Лодочные моторы",
    "sounder": "Эхолоты",
    "rod": "Удилища",
    "coil": "Рыболовные катушки",
    "icescrew": "Ледобуры",
    "hunter_clothes": "Одежда для охоты и рыбалки",
    "supboard": "SUP-доски",
    "notebookcase": "Сумки и чехлы",
}

CATEGORIES_LIST_FOR_PROMPT = ", ".join(
    f"'{k}' ({v})" for k, v in ALL_CATEGORIES.items()
)

SYSTEM_PROMPT = (
    "You are an Active Tourism gear rental assistant. "
    "LANGUAGE: Always respond in Russian.\n\n"
    "AVAILABLE PRODUCT CATEGORIES:\n" + CATEGORIES_LIST_FOR_PROMPT + "\n\n"
    "YOUR TASK:\n"
    "When a user describes an adventure, you MUST search products across MULTIPLE relevant categories.\n"
    "- For a bike trip: search 'bike' or 'kidsbike', 'bikehelmet', 'bike_accessories', etc.\n"
    "- For camping: search 'tents', 'sleepingbag', 'travel_mat', 'backpack', 'lights', 'camping_cookware', etc.\n"
    "- For a BBQ/picnic: search 'grill', 'bbq_accessories', 'camp_furniture', 'thermosbottle', etc.\n"
    "- For water activities: search 'swimming_goods', 'actioncamera', 'supboard', 'inflatableboat', 'outboardmotors', etc.\n"
    "- For fishing: search 'rod', 'coil', 'sounder', 'hunter_clothes', 'icescrew', etc.\n\n"
    "RULES:\n"
    "1. Use get_available_filters when the user is specific (e.g., 'mountain bike', 'tent for 2') to perform a precision search. If the user gives any information about age, height, etc. you fust use filters. For general requests, you can call search_products directly with empty filters {} to save time.\n"
    "2. Call set_rent_duration with an integer of days if the user mentions trip length (e.g. 'на 3 дня', 'неделя').\n"
    "3. You MUST search at least 3 different categories per trip.\n"
    "4. Each search_products call MUST include a descriptive Russian 'stage_label' (e.g. 'Велосипеды', 'Палатки', 'Шлемы').\n"
    "5. After ALL searches complete, write ONE short Russian comment (1-2 sentences).\n"
    "6. Do NOT list products in text — the system renders product cards automatically.\n"
    "7. You can make multiple tool calls in a SINGLE response in parallel."
)

class TourismChatbot:
    def __init__(self):
        self._client = None
        load_dotenv()
        provider = os.getenv("LLM_PROVIDER", "groq").lower()
        if provider == "deepseek":
            self.model = "deepseek-chat"
        else:
            self.model = "llama-3.3-70b-versatile"
            
        self.rent_days = None
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_available_filters",
                    "description": "Fetch available filter names and their allowed values for a product category.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "category": {
                                "type": "string",
                                "description": f"Category key. Available: {', '.join(ALL_CATEGORIES.keys())}"
                            }
                        },
                        "required": ["category"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "search_products",
                    "description": (
                        "Search products with filters. Returns products with rent_price and IDs. "
                        "For dictionary filters, pass a list of IDs. "
                        "For range filters, pass {\"from\": min, \"to\": max}. "
                        "For boolean filters, pass true/false. "
                        "You can pass an empty filters object {} to search without filters."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "category": {
                                "type": "string",
                                "description": f"Category key. Available: {', '.join(ALL_CATEGORIES.keys())}"
                            },
                            "filters": {
                                "type": "object",
                                "description": "Filter key-value pairs. Use keys from get_available_filters. Can be empty {}."
                            },
                            "stage_label": {
                                "type": "string",
                                "description": "A descriptive Russian label for this search stage, e.g. 'Горные велосипеды', 'Палатки', 'Велошлемы'."
                            }
                        },
                        "required": ["category", "stage_label"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "save_roadmap",
                    "description": "Save a recommended set of products as a roadmap for the user.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Title for the roadmap."},
                            "description": {"type": "string", "description": "Summary of the roadmap."},
                            "product_ids": {
                                "type": "array",
                                "items": {"type": "integer"},
                                "description": "List of product IDs from previous search results."
                            }
                        },
                        "required": ["name", "description", "product_ids"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "set_rent_duration",
                    "description": "Set the rent duration based on user prompt (e.g. 3 days).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "days": {"type": "integer", "description": "Number of days for rent."}
                        },
                        "required": ["days"]
                    }
                }
            }
        ]

    @property
    def client(self):
        if self._client is None:
            load_dotenv()
            provider = os.getenv("LLM_PROVIDER", "groq").lower()
            
            if provider == "deepseek":
                api_key = os.getenv("DEEPSEEK_API_KEY", "")
                base_url = "https://api.deepseek.com"
            else:
                api_key = os.getenv("GROQ_API_KEY", "")
                base_url = "https://api.groq.com/openai/v1"

            self._client = OpenAI(
                api_key=api_key,
                base_url=base_url,
            )
        return self._client

    def chat_stream(self, messages: list):
        if not messages or messages[0].get("role") != "system":
            messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

        stages = []
        max_iterations = 10
        self.rent_days = None

        try:
            for iteration_count in range(max_iterations):
                if iteration_count == 0:
                    yield json.dumps({"status": "progress", "message": "Анализирую параметры запроса..."}, ensure_ascii=False) + "\n"
                else:
                    yield json.dumps({"status": "progress", "message": "Сверяю с каталогом снаряжения..."}, ensure_ascii=False) + "\n"

                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=self.tools,
                    tool_choice="auto",
                )

                msg = response.choices[0].message

                if not msg.tool_calls:
                    content = msg.content or ""
                    if "<｜" in content:
                        import re
                        content = re.sub(r'<｜.*', '', content, flags=re.DOTALL).strip()
                    
                    yield json.dumps({
                        "status": "done",
                        "reply": content,
                        "stages": stages,
                        "rent_days": self.rent_days
                    }, ensure_ascii=False) + "\n"
                    return

                messages.append(msg.model_dump(exclude_unset=True))

                for tc in msg.tool_calls:
                    fn_name = tc.function.name
                    
                    try:
                        fn_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        fn_args = {}
                        
                    if fn_name == "search_products":
                        lbl = fn_args.get("stage_label", "товары")
                        filt_count = len(fn_args.get("filters", {}))
                        f_info = f" (фильтров: {filt_count})" if filt_count > 0 else ""
                        yield json.dumps({"status": "progress", "message": f"Ищу {lbl}{f_info}..."[:60]}, ensure_ascii=False) + "\n"
                    elif fn_name == "get_available_filters":
                        cat_show = ALL_CATEGORIES.get(fn_args.get("category"), "категории")
                        yield json.dumps({"status": "progress", "message": f"Подбираю критерии для {cat_show}..."[:60]}, ensure_ascii=False) + "\n"

                    result = self._execute_tool(fn_name, fn_args, stages)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": fn_name,
                        "content": result,
                    })

            yield json.dumps({
                "status": "done",
                "reply": "Я подобрал для вас снаряжение! Посмотрите карточки товаров.",
                "stages": stages,
                "rent_days": self.rent_days
            }, ensure_ascii=False) + "\n"

        except Exception as e:
            traceback.print_exc()
            yield json.dumps({
                "status": "error",
                "reply": "Произошла ошибка при обработке запроса. Попробуйте еще раз.",
                "stages": [],
                "rent_days": None
            }, ensure_ascii=False) + "\n"

    def _execute_tool(self, name: str, args: dict, stages: list) -> str:
        try:
            if name == "get_available_filters":
                category = args.get("category", "bike")
                raw_filters = get_available_filters(category)
                
                # Trim large option lists
                trimmed = {}
                for fid, fdata in raw_filters.items():
                    if 'options' in fdata and len(fdata['options']) > 15:
                        fdata = {**fdata, 'options': fdata['options'][:15] + ['...']}
                    trimmed[fid] = fdata
                    
                return json.dumps(trimmed, ensure_ascii=False)

            elif name == "search_products":
                category = args.get("category", "bike")
                stage_label = args.get("stage_label", ALL_CATEGORIES.get(category, "Результаты"))
                filters_raw = args.get("filters", {})
                
                if isinstance(filters_raw, str):
                    try:
                        filters_raw = json.loads(filters_raw)
                    except json.JSONDecodeError:
                        filters_raw = {}

                cleaned = {}
                for k, v in filters_raw.items():
                    if isinstance(v, dict) and "value" in v:
                        cleaned[k] = v["value"]
                    else:
                        cleaned[k] = v

                results = search_products(category, cleaned)
                top_results = results[:20]

                if top_results:
                    stages.append({
                        "label": stage_label,
                        "products": top_results,
                    })

                if not top_results:
                    return json.dumps({"message": "No products found. Try broader filters or different category."})

                summary = [{"id": p["id"], "name": p["name"], "rent_price": p["rent_price"]} for p in top_results]
                return json.dumps(summary, ensure_ascii=False)

            elif name == "save_roadmap":
                rm_name = args.get("name", "Маршрут")
                rm_desc = args.get("description", "")
                rm_ids = args.get("product_ids", [])
                
                roadmap = Roadmap.objects.create(name=rm_name, description=rm_desc, is_demo=True)
                for i, pid in enumerate(rm_ids):
                    try:
                        product = ProductCache.objects.get(id=pid)
                        RoadmapItem.objects.create(roadmap=roadmap, product=product, step_number=i + 1)
                    except ProductCache.DoesNotExist:
                        continue
                
                return json.dumps({"status": "saved", "roadmap_id": roadmap.id})

            elif name == "set_rent_duration":
                days = args.get("days", 1)
                self.rent_days = days
                return json.dumps({"status": "success", "message": f"Duration set to {days} days."})

            else:
                return json.dumps({"error": f"Unknown function: {name}"})

        except Exception as e:
            traceback.print_exc()
            return json.dumps({"error": str(e)})
